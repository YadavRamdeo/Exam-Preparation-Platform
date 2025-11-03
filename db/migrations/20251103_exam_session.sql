-- PostgreSQL schema and functions for concurrency-safe unique test generation for batches (e.g., 100 candidates)
-- Run on PostgreSQL 12+.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Questions master
CREATE TABLE IF NOT EXISTS question (
  id BIGSERIAL PRIMARY KEY,
  stem TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty INT NOT NULL,
  topic TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Blueprint and rules
CREATE TABLE IF NOT EXISTS exam_blueprint (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_blueprint_rule (
  id BIGSERIAL PRIMARY KEY,
  blueprint_id BIGINT NOT NULL REFERENCES exam_blueprint(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  difficulty INT NOT NULL,
  q_count INT NOT NULL CHECK (q_count > 0)
);

-- A concrete scheduled batch/session (e.g., Nov 10 10:00–11:00)
CREATE TABLE IF NOT EXISTS exam_session (
  id BIGSERIAL PRIMARY KEY,
  blueprint_id BIGINT NOT NULL REFERENCES exam_blueprint(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  candidate_count INT NOT NULL CHECK (candidate_count > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pool of preselected questions for the session, to allocate atomically with SKIP LOCKED
CREATE TABLE IF NOT EXISTS exam_session_pool (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES exam_session(id) ON DELETE CASCADE,
  rule_id BIGINT NOT NULL REFERENCES exam_blueprint_rule(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES question(id) ON DELETE RESTRICT,
  assigned_to TEXT NULL,                 -- candidate_id
  assigned_at TIMESTAMPTZ,
  CONSTRAINT uq_session_question UNIQUE (session_id, question_id),
  CONSTRAINT uq_session_rule_question UNIQUE (session_id, rule_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_unassigned ON exam_session_pool(session_id, rule_id) WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_pool_assigned ON exam_session_pool(session_id, assigned_to);

-- Generated form per candidate
CREATE TABLE IF NOT EXISTS test_form (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES exam_session(id) ON DELETE CASCADE,
  blueprint_id BIGINT NOT NULL REFERENCES exam_blueprint(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  seed BIGINT NOT NULL,
  question_ids BIGINT[] NOT NULL,
  q_order INT[] NOT NULL,
  options_seed BIGINT NOT NULL,
  uniq_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_session_candidate UNIQUE (session_id, candidate_id),
  CONSTRAINT uq_form_hash UNIQUE (uniq_hash)
);

-- Helper: secure-ish 64-bit seed (non-crypto critical)
CREATE OR REPLACE FUNCTION secure_seed64() RETURNS BIGINT LANGUAGE sql AS $$
  SELECT (floor(random()*9223372036854775807))::BIGINT
$$;

-- Create a session and prefill its pool for N candidates
CREATE OR REPLACE FUNCTION create_exam_session_and_prefill(
  p_blueprint_id BIGINT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_candidate_count INT
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_session_id BIGINT;
  rec RECORD;
  need_per_rule INT;
  inserted INT;
  actually_inserted INT;
BEGIN
  INSERT INTO exam_session(blueprint_id, starts_at, ends_at, candidate_count)
  VALUES (p_blueprint_id, p_starts_at, p_ends_at, p_candidate_count)
  RETURNING id INTO v_session_id;

  FOR rec IN
    SELECT r.id AS rule_id, r.topic, r.difficulty, r.q_count
    FROM exam_blueprint_rule r
    WHERE r.blueprint_id = p_blueprint_id
  LOOP
    need_per_rule := rec.q_count * p_candidate_count;

    -- Capacity check
    PERFORM 1 FROM (
      SELECT count(*) AS c
      FROM question q
      WHERE q.status='active'
        AND q.topic = rec.topic
        AND q.difficulty = rec.difficulty
    ) s WHERE s.c >= need_per_rule;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient questions for rule % (topic %, diff %): need %, have less',
        rec.rule_id, rec.topic, rec.difficulty, need_per_rule;
    END IF;

    -- Initial randomized insert; avoid cross-rule duplicates via ON CONFLICT
    WITH picked AS (
      SELECT q.id AS question_id
      FROM question q
      WHERE q.status='active'
        AND q.topic = rec.topic
        AND q.difficulty = rec.difficulty
      ORDER BY random()
      LIMIT need_per_rule * 2
    )
    INSERT INTO exam_session_pool(session_id, rule_id, question_id)
    SELECT v_session_id, rec.rule_id, p.question_id FROM picked p
    ON CONFLICT (session_id, question_id) DO NOTHING;

    GET DIAGNOSTICS inserted = ROW_COUNT;

    IF inserted < need_per_rule THEN
      WITH more AS (
        SELECT q.id AS question_id
        FROM question q
        WHERE q.status='active'
          AND q.topic = rec.topic
          AND q.difficulty = rec.difficulty
          AND NOT EXISTS (
            SELECT 1 FROM exam_session_pool esp
            WHERE esp.session_id = v_session_id
              AND esp.question_id = q.id
          )
        ORDER BY random()
        LIMIT (need_per_rule - inserted)
      )
      INSERT INTO exam_session_pool(session_id, rule_id, question_id)
      SELECT v_session_id, rec.rule_id, m.question_id FROM more m
      ON CONFLICT (session_id, question_id) DO NOTHING;

      GET DIAGNOSTICS actually_inserted = ROW_COUNT;
      IF inserted + actually_inserted < need_per_rule THEN
        RAISE EXCEPTION 'Session %: still short for rule %; needed %, got %',
          v_session_id, rec.rule_id, need_per_rule, inserted + actually_inserted;
      END IF;
    END IF;
  END LOOP;

  RETURN v_session_id;
END
$$;

-- Allocate a unique form atomically; safe for 100 concurrent calls
CREATE OR REPLACE FUNCTION allocate_form_for_candidate(
  p_session_id BIGINT,
  p_candidate_id TEXT
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
  -- Return existing form if already allocated
  IF EXISTS (SELECT 1 FROM test_form WHERE session_id = p_session_id AND candidate_id = p_candidate_id) THEN
    SELECT id INTO v_form_id FROM test_form WHERE session_id = p_session_id AND candidate_id = p_candidate_id;
    RETURN v_form_id;
  END IF;

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
      SET assigned_to = p_candidate_id, assigned_at = now()
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

  -- Build deterministic shuffle based on seed
  WITH idxs AS (
    SELECT generate_subscripts(v_q_ids,1) AS idx
  ), scores AS (
    SELECT idx,
      ('x'||substr(encode(digest(v_seed::text||':'||idx::text, 'sha256'),'hex'),1,8))::bit(32)::int AS score
    FROM idxs
  ), ord AS (
    SELECT idx FROM scores ORDER BY score
  )
  SELECT array_agg(idx) INTO v_q_order FROM ord;

  WITH ord AS (
    SELECT idx
    FROM (
      WITH idxs AS (
        SELECT generate_subscripts(v_q_ids,1) AS idx
      ), scores AS (
        SELECT idx,
          ('x'||substr(encode(digest(v_seed::text||':'||idx::text, 'sha256'),'hex'),1,8))::bit(32)::int AS score
        FROM idxs
      )
      SELECT idx FROM scores ORDER BY score
    ) s
  )
  SELECT array_agg(v_q_ids[idx]) INTO v_q_ids_shuffled FROM ord;

  v_hash := encode(digest(array_to_string(v_q_ids_shuffled, ','), 'sha256'), 'hex');

  INSERT INTO test_form(session_id, blueprint_id, candidate_id, seed, question_ids, q_order, options_seed, uniq_hash)
  VALUES (p_session_id, v_bp_id, p_candidate_id, v_seed, v_q_ids_shuffled, v_q_order, v_opt_seed, v_hash)
  ON CONFLICT (uniq_hash) DO NOTHING
  RETURNING id INTO v_form_id;

  IF v_form_id IS NULL THEN
    -- rare hash collision: retry once
    RETURN allocate_form_for_candidate(p_session_id, p_candidate_id);
  END IF;

  RETURN v_form_id;
END
$$;

-- Usage examples:
-- SELECT create_exam_session_and_prefill(<blueprint_id>, '2025-11-10 10:00+00', '2025-11-10 11:00+00', 100);
-- Then call in parallel for each candidate: SELECT allocate_form_for_candidate(<session_id>, '<candidate_id>');
