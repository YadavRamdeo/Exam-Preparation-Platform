-- Development smoke test: runs end-to-end flow inside a transaction and rolls back.
-- Requires migrations applied and pgcrypto extension available.

BEGIN;

DO $$
DECLARE
  v_bp BIGINT;
  v_rule1 BIGINT;
  v_rule2 BIGINT;
  v_parent BIGINT;
  v_teacher BIGINT;
  v_students BIGINT[] := ARRAY[]::BIGINT[];
  v_session BIGINT;
  v_form BIGINT;
  v_attempt BIGINT;
  v_needed INT;
  v_assigned INT;
  r RECORD;
BEGIN
  RAISE NOTICE 'Starting smoke test...';

  -- Create blueprint and two rules: 2 Qs of topic MATH diff 1, and 2 Qs of topic SCI diff 2 per student
  INSERT INTO exam_blueprint(name) VALUES ('DEMO_BP') RETURNING id INTO v_bp;
  INSERT INTO exam_blueprint_rule(blueprint_id, topic, difficulty, q_count) VALUES
    (v_bp, 'MATH', 1, 2),
    (v_bp, 'SCI',  2, 2)
  RETURNING id INTO v_rule1;
  SELECT id INTO v_rule2 FROM exam_blueprint_rule WHERE blueprint_id=v_bp AND id<>v_rule1 LIMIT 1;

  -- Seed questions (ensure at least 400 unique across both rule specs to handle up to 100 students)
  FOR r IN SELECT 1 AS i LOOP
    -- MATH diff 1: 250
    INSERT INTO question(stem, type, difficulty, topic, tags)
    SELECT format('Math Q #%s', gs)::text, 'mcq_single', 1, 'MATH', '[]'::jsonb
    FROM generate_series(1, 250) gs;

    -- SCI diff 2: 250
    INSERT INTO question(stem, type, difficulty, topic, tags)
    SELECT format('Sci Q #%s', gs)::text, 'mcq_single', 2, 'SCI', '[]'::jsonb
    FROM generate_series(1, 250) gs;
  END LOOP;

  -- Create 4 choices per MCQ, first is correct
  INSERT INTO choice(question_id, label, text, is_correct, ord)
  SELECT q.id, l.lbl, format('%s option %s', q.stem, l.lbl), (l.ord=1), l.ord
  FROM question q
  CROSS JOIN (VALUES ('A',1),('B',2),('C',3),('D',4)) AS l(lbl,ord)
  WHERE q.type='mcq_single';

  -- Create users: 1 parent, 1 teacher, 5 students
  INSERT INTO user_account(full_name, role, email) VALUES ('Parent Demo','parent','parent@example.com') RETURNING id INTO v_parent;
  INSERT INTO user_account(full_name, role, email) VALUES ('Teacher Demo','teacher','teacher@example.com') RETURNING id INTO v_teacher;
  FOR r IN SELECT generate_series(1,5) AS i LOOP
    INSERT INTO user_account(full_name, role, email)
    VALUES (format('Student %s', r.i), 'student', format('student%s@example.com', r.i))
    RETURNING id INTO v_form; -- reuse v_form as temp
    v_students := v_students || v_form;
    INSERT INTO student_guardian(parent_id, student_id) VALUES (v_parent, v_form) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_student(teacher_id, student_id) VALUES (v_teacher, v_form) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Create session for those students and enroll
  v_session := create_exam_session_and_enroll(v_bp, now() + interval '10 minutes', now() + interval '70 minutes', v_students);

  -- Allocate forms by access code for each student
  FOR r IN SELECT esc.student_id, esc.access_code FROM exam_session_candidate esc WHERE esc.session_id = v_session LOOP
    v_form := allocate_form_by_access_code(v_session, r.access_code);
    IF v_form IS NULL THEN RAISE EXCEPTION 'Form allocation failed for student %', r.student_id; END IF;
  END LOOP;

  -- Validate: each student got 4 questions and no duplicates across students in session
  SELECT (SELECT COUNT(*) FROM exam_blueprint_rule WHERE blueprint_id=v_bp) * 2 * array_length(v_students,1)
    INTO v_needed; -- 2 qs per rule * rule count is 2 -> 4 per student; total 4*N assignments

  SELECT COUNT(*) INTO v_assigned FROM (
    SELECT unnest(question_ids) AS qid, student_id
    FROM test_form tf WHERE tf.session_id = v_session
  ) t;

  IF v_assigned <> 4 * array_length(v_students,1) THEN
    RAISE EXCEPTION 'Assigned % questions but expected %', v_assigned, 4 * array_length(v_students,1);
  END IF;

  -- Ensure uniqueness across students
  PERFORM 1 FROM (
    SELECT qid, COUNT(DISTINCT student_id) c
    FROM (
      SELECT unnest(question_ids) AS qid, student_id FROM test_form WHERE session_id = v_session
    ) s
    GROUP BY qid
    HAVING MAX(c) > 1
  ) clash;
  IF FOUND THEN RAISE EXCEPTION 'Question appeared in more than one student form'; END IF;

  -- Start attempts and answer first question correct, rest incorrect
  FOR r IN SELECT tf.id AS form_id, tf.student_id, tf.question_ids FROM test_form tf WHERE tf.session_id = v_session LOOP
    v_attempt := start_attempt(r.form_id, r.student_id);
    -- First question correct
    INSERT INTO response(attempt_id, question_id, selected_choice_ids)
    SELECT v_attempt, r.question_ids[1], ARRAY[(SELECT c.id FROM choice c WHERE c.question_id = r.question_ids[1] AND c.is_correct LIMIT 1)];
    -- Others incorrect (pick a wrong choice)
    INSERT INTO response(attempt_id, question_id, selected_choice_ids)
    SELECT v_attempt, qid, ARRAY[(SELECT c2.id FROM choice c2 WHERE c2.question_id = qid AND NOT c2.is_correct LIMIT 1)]
    FROM unnest(r.question_ids[2:4]) AS qid;
    PERFORM submit_attempt_and_grade(v_attempt);
  END LOOP;

  -- Verify reporting views return rows for parent/teacher
  IF NOT EXISTS (SELECT 1 FROM v_parent_attempts WHERE parent_id = v_parent) THEN
    RAISE EXCEPTION 'Parent view empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM v_teacher_attempts WHERE teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'Teacher view empty';
  END IF;

  RAISE NOTICE 'Smoke test completed OK.';
END $$;

-- Roll back demo data
ROLLBACK;