-- Users, enrollments, access codes, attempts, responses, and reporting views
-- Extends prior migration to support per-student login and parent/teacher visibility

-- Roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student','parent','teacher','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User accounts
CREATE TABLE IF NOT EXISTS user_account (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Parent <-> Student mapping (many-to-many)
CREATE TABLE IF NOT EXISTS student_guardian (
  parent_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (parent_id, student_id)
);

-- Teacher <-> Student mapping (many-to-many)
CREATE TABLE IF NOT EXISTS teacher_student (
  teacher_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (teacher_id, student_id)
);

-- Choices for MCQs
CREATE TABLE IF NOT EXISTS choice (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  label TEXT,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  ord INT NOT NULL
);

-- Candidate enrollment per session with unique access codes
CREATE TABLE IF NOT EXISTS exam_session_candidate (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES exam_session(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  access_code TEXT NOT NULL,                 -- short login code for this session
  login_expires_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE (session_id, student_id),
  UNIQUE (session_id, access_code)
);

-- Extend test_form to link to student and carry access_code (for convenience)
DO $$ BEGIN
  ALTER TABLE test_form ADD COLUMN student_id BIGINT REFERENCES user_account(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE test_form ADD COLUMN access_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Keep existing uniqs; add a new one when student_id is present
DO $$ BEGIN
  ALTER TABLE test_form ADD CONSTRAINT uq_session_student UNIQUE (session_id, student_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attempts and responses
CREATE TABLE IF NOT EXISTS attempt (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES exam_session(id) ON DELETE CASCADE,
  test_form_id BIGINT NOT NULL REFERENCES test_form(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  duration_ms INT,
  score NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, submitted, graded
  CONSTRAINT uq_attempt_per_form_student UNIQUE (test_form_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_student ON attempt(student_id, session_id);

CREATE TABLE IF NOT EXISTS response (
  id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  selected_choice_ids BIGINT[],
  text_response TEXT,
  correct BOOLEAN,
  time_spent_ms INT
);

-- Helper to create short access codes (8 chars base32-ish)
CREATE OR REPLACE FUNCTION gen_access_code() RETURNS TEXT LANGUAGE sql AS $$
  SELECT upper(replace(encode(gen_random_bytes(6),'base64'),'=',''))::text
$$;

-- Create session for 1..100 students, prefill pool, and enroll with unique access codes
CREATE OR REPLACE FUNCTION create_exam_session_and_enroll(
  p_blueprint_id BIGINT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_student_ids BIGINT[]
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_session_id BIGINT;
  v_count INT := COALESCE(array_length(p_student_ids,1), 0);
  sid BIGINT;
BEGIN
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'Student count must be between 1 and 100 (got %)', v_count;
  END IF;

  -- Create session and prefill pool based on count
  v_session_id := create_exam_session_and_prefill(p_blueprint_id, p_starts_at, p_ends_at, v_count);

  -- Enroll each student with unique access code
  FOREACH sid IN ARRAY p_student_ids LOOP
    INSERT INTO exam_session_candidate(session_id, student_id, access_code, login_expires_at)
    VALUES (v_session_id, sid, gen_access_code(), p_ends_at)
    ON CONFLICT (session_id, student_id) DO NOTHING;
  END LOOP;

  RETURN v_session_id;
END
$$;

-- Allocate a form by access_code (used at login)
CREATE OR REPLACE FUNCTION allocate_form_by_access_code(
  p_session_id BIGINT,
  p_access_code TEXT
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_student_id BIGINT;
  v_form_id BIGINT;
BEGIN
  SELECT esc.student_id INTO v_student_id
  FROM exam_session_candidate esc
  WHERE esc.session_id = p_session_id AND esc.access_code = p_access_code;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Invalid access code for session %', p_session_id;
  END IF;

  v_form_id := allocate_form_for_student(p_session_id, v_student_id, p_access_code);
  RETURN v_form_id;
END
$$;

-- Student-centric allocation wrapper
CREATE OR REPLACE FUNCTION allocate_form_for_student(
  p_session_id BIGINT,
  p_student_id BIGINT,
  p_access_code TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_bp_id BIGINT;
  v_seed BIGINT := secure_seed64();
  v_opt_seed BIGINT := secure_seed64();
  v_q_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_q_ids_new BIGINT[];
  v_q_order INT[];
  v_q_ids_shuffled BIGINT[];
  rec RECORD;
  v_form_id BIGINT;
  v_hash TEXT;
BEGIN
  -- If form exists, return it
  SELECT id INTO v_form_id FROM test_form WHERE session_id = p_session_id AND student_id = p_student_id;
  IF v_form_id IS NOT NULL THEN RETURN v_form_id; END IF;

  SELECT blueprint_id INTO v_bp_id FROM exam_session WHERE id = p_session_id FOR UPDATE;

  FOR rec IN
    SELECT r.id AS rule_id, r.q_count
    FROM exam_blueprint_rule r
    WHERE r.blueprint_id = v_bp_id
    ORDER BY r.id
  LOOP
    WITH pick AS (
      SELECT id, question_id
      FROM exam_session_pool
      WHERE session_id = p_session_id
        AND rule_id = rec.rule_id
        AND assigned_to IS NULL
      ORDER BY random()
      LIMIT rec.q_count
      FOR UPDATE SKIP LOCKED
    ), upd AS (
      UPDATE exam_session_pool esp
      SET assigned_to = p_student_id::text, assigned_at = now()
      FROM pick p
      WHERE esp.id = p.id
      RETURNING p.question_id
    )
    SELECT COALESCE(array_agg(question_id), ARRAY[]::BIGINT[])
    INTO v_q_ids_new
    FROM upd;

    IF array_length(v_q_ids_new, 1) IS DISTINCT FROM rec.q_count THEN
      RAISE EXCEPTION 'Not enough questions available for rule % during allocation (session %)', rec.rule_id, p_session_id;
    END IF;

    v_q_ids := v_q_ids || v_q_ids_new;
  END LOOP;

  -- Deterministic order array and shuffled question_ids based on seed
  WITH idxs AS (
    SELECT generate_subscripts(v_q_ids,1) AS idx
  ), scores AS (
    SELECT idx,
      ('x'||substr(encode(digest(v_seed::text||':'||idx::text, 'sha256'),'hex'),1,8))::bit(32)::int AS score
    FROM idxs
  ), ord AS (
    SELECT idx FROM scores ORDER BY score
  )
  SELECT array_agg(idx), array_agg(v_q_ids[idx])
  INTO v_q_order, v_q_ids_shuffled
  FROM ord;

  v_hash := encode(digest(array_to_string(v_q_ids_shuffled, ','), 'sha256'), 'hex');

  INSERT INTO test_form(session_id, blueprint_id, candidate_id, student_id, access_code, seed, question_ids, q_order, options_seed, uniq_hash)
  SELECT es.id, es.blueprint_id, p_access_code, p_student_id, p_access_code, v_seed, v_q_ids_shuffled, v_q_order, v_opt_seed, v_hash
  FROM exam_session es WHERE es.id = p_session_id
  ON CONFLICT (uniq_hash) DO NOTHING
  RETURNING id INTO v_form_id;

  IF v_form_id IS NULL THEN
    -- rare collision: retry
    RETURN allocate_form_for_student(p_session_id, p_student_id, p_access_code);
  END IF;

  RETURN v_form_id;
END
$$;

-- Start attempt (called when student enters exam); ensures single attempt per form
CREATE OR REPLACE FUNCTION start_attempt(p_form_id BIGINT, p_student_id BIGINT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT; v_session BIGINT; BEGIN
  SELECT session_id INTO v_session FROM test_form WHERE id = p_form_id AND student_id = p_student_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Form not found for student'; END IF;
  INSERT INTO attempt(session_id, test_form_id, student_id, started_at)
  VALUES (v_session, p_form_id, p_student_id, now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM attempt WHERE test_form_id = p_form_id AND student_id = p_student_id; END IF;
  RETURN v_id; END $$;

-- Submit attempt and auto-grade MCQs
CREATE OR REPLACE FUNCTION submit_attempt_and_grade(p_attempt_id BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE attempt SET submitted_at = now(), status='submitted'
  WHERE id = p_attempt_id AND submitted_at IS NULL;

  -- Auto-grade MCQ by comparing selected_choice_ids to correct set
  WITH corr AS (
    SELECT r.attempt_id, r.question_id,
           ARRAY(SELECT c.id FROM choice c WHERE c.question_id = r.question_id AND c.is_correct) AS corr_ids
    FROM response r WHERE r.attempt_id = p_attempt_id
  )
  UPDATE response r
  SET correct = (r.selected_choice_ids IS NOT NULL AND r.selected_choice_ids @> corr.corr_ids AND corr.corr_ids @> r.selected_choice_ids)
  FROM corr WHERE r.attempt_id = corr.attempt_id AND r.question_id = corr.question_id;

  -- Score: 1 per correct, 0 otherwise
  UPDATE attempt a
  SET score = sub.sc,
      status = 'graded'
  FROM (
    SELECT r.attempt_id, SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS sc
    FROM response r
    WHERE r.attempt_id = p_attempt_id
    GROUP BY r.attempt_id
  ) sub
  WHERE a.id = sub.attempt_id;
END
$$;

-- Reporting views
CREATE OR REPLACE VIEW v_student_attempts AS
SELECT a.id AS attempt_id, a.session_id, a.test_form_id, a.student_id, ua.full_name AS student_name,
       a.started_at, a.submitted_at, a.score
FROM attempt a
JOIN user_account ua ON ua.id = a.student_id;

CREATE OR REPLACE VIEW v_parent_attempts AS
SELECT sg.parent_id, v.*
FROM v_student_attempts v
JOIN student_guardian sg ON sg.student_id = v.student_id;

CREATE OR REPLACE VIEW v_teacher_attempts AS
SELECT ts.teacher_id, v.*
FROM v_student_attempts v
JOIN teacher_student ts ON ts.student_id = v.student_id;
