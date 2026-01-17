-- ============================================
-- MEDICATION DOSES TEST SCRIPT
-- Run in Supabase SQL Editor
-- ============================================

-- Use a clearly identifiable test UUID
-- This allows easy cleanup and won't conflict with real data
DO $$
DECLARE
  test_med_id UUID := '00000000-0000-0000-0000-000000000001';
  test_user_id UUID := '00000000-0000-0000-0000-000000000002';
  test_dose_1 UUID := '00000000-0000-0000-0000-000000000101';
  test_dose_2 UUID := '00000000-0000-0000-0000-000000000102';
  test_dose_3 UUID := '00000000-0000-0000-0000-000000000103';
  test_dose_4 UUID := '00000000-0000-0000-0000-000000000104';
  test_dose_5 UUID := '00000000-0000-0000-0000-000000000105';

  auto_skip_count INT;
  stored_time TIMESTAMP;
  expected_time TIMESTAMP;
  given_count INT;
  pending_count INT;
  skipped_count INT;
  total_count INT;

  all_passed BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'MEDICATION DOSES TEST SUITE';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';

  -- ==========================================
  -- CLEANUP: Remove any existing test data
  -- ==========================================
  DELETE FROM medication_doses WHERE medication_id = test_med_id;
  DELETE FROM medications WHERE id = test_med_id;

  -- Create test medication
  INSERT INTO medications (id, user_id, pet_id, name, dosage, frequency, start_date, status)
  VALUES (test_med_id, test_user_id, NULL, 'TEST_MEDICATION_DO_NOT_USE', '10mg', 'daily', CURRENT_DATE, 'active')
  ON CONFLICT (id) DO NOTHING;

  -- ==========================================
  -- TEST 1: AUTO-SKIP LOGIC
  -- Doses older than 24 hours should be caught
  -- ==========================================
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'TEST 1: AUTO-SKIP LOGIC';
  RAISE NOTICE '----------------------------------------';

  -- Insert a pending dose from 48 hours ago
  INSERT INTO medication_doses (id, medication_id, user_id, scheduled_time, status)
  VALUES (
    test_dose_1,
    test_med_id,
    test_user_id,
    NOW() - INTERVAL '48 hours',
    'pending'
  );

  -- Insert a pending dose from 12 hours ago (should NOT be auto-skipped)
  INSERT INTO medication_doses (id, medication_id, user_id, scheduled_time, status)
  VALUES (
    test_dose_2,
    test_med_id,
    test_user_id,
    NOW() - INTERVAL '12 hours',
    'pending'
  );

  -- Count doses that would be auto-skipped (>24 hours old and pending)
  SELECT COUNT(*) INTO auto_skip_count
  FROM medication_doses
  WHERE medication_id = test_med_id
    AND status = 'pending'
    AND scheduled_time < NOW() - INTERVAL '24 hours';

  IF auto_skip_count = 1 THEN
    RAISE NOTICE '[PASS] Auto-skip query found exactly 1 dose (48h old)';
  ELSE
    RAISE NOTICE '[FAIL] Auto-skip query found % doses, expected 1', auto_skip_count;
    all_passed := FALSE;
  END IF;

  -- Verify the 12-hour-old dose is NOT caught
  SELECT COUNT(*) INTO auto_skip_count
  FROM medication_doses
  WHERE medication_id = test_med_id
    AND id = test_dose_2
    AND status = 'pending'
    AND scheduled_time < NOW() - INTERVAL '24 hours';

  IF auto_skip_count = 0 THEN
    RAISE NOTICE '[PASS] 12-hour-old dose correctly excluded from auto-skip';
  ELSE
    RAISE NOTICE '[FAIL] 12-hour-old dose incorrectly included in auto-skip';
    all_passed := FALSE;
  END IF;

  -- ==========================================
  -- TEST 2: SCHEDULED_TIME FORMAT
  -- Verify timestamp is stored without timezone shift
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'TEST 2: SCHEDULED_TIME FORMAT';
  RAISE NOTICE '----------------------------------------';

  -- Insert a dose with a specific time (e.g., 2:30 PM today)
  expected_time := DATE_TRUNC('day', NOW()) + INTERVAL '14 hours 30 minutes';

  INSERT INTO medication_doses (id, medication_id, user_id, scheduled_time, status)
  VALUES (
    test_dose_3,
    test_med_id,
    test_user_id,
    expected_time,
    'pending'
  );

  -- Retrieve and verify
  SELECT scheduled_time INTO stored_time
  FROM medication_doses
  WHERE id = test_dose_3;

  IF stored_time = expected_time THEN
    RAISE NOTICE '[PASS] scheduled_time stored correctly: %', stored_time;
  ELSE
    RAISE NOTICE '[FAIL] scheduled_time mismatch';
    RAISE NOTICE '       Expected: %', expected_time;
    RAISE NOTICE '       Got: %', stored_time;
    all_passed := FALSE;
  END IF;

  -- Show the raw format
  RAISE NOTICE '       Raw ISO format: %', TO_CHAR(stored_time, 'YYYY-MM-DD"T"HH24:MI:SS');

  -- ==========================================
  -- TEST 3: PROGRESS CALCULATION
  -- Verify counting by status works correctly
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'TEST 3: PROGRESS CALCULATION';
  RAISE NOTICE '----------------------------------------';

  -- Insert additional doses with different statuses
  INSERT INTO medication_doses (id, medication_id, user_id, scheduled_time, status, given_time)
  VALUES (
    test_dose_4,
    test_med_id,
    test_user_id,
    NOW() - INTERVAL '2 days',
    'given',
    NOW() - INTERVAL '2 days'
  );

  INSERT INTO medication_doses (id, medication_id, user_id, scheduled_time, status)
  VALUES (
    test_dose_5,
    test_med_id,
    test_user_id,
    NOW() - INTERVAL '3 days',
    'skipped'
  );

  -- Count by status
  SELECT
    COUNT(*) FILTER (WHERE status = 'given') AS given,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
    COUNT(*) AS total
  INTO given_count, pending_count, skipped_count, total_count
  FROM medication_doses
  WHERE medication_id = test_med_id;

  RAISE NOTICE 'Dose counts: given=%, pending=%, skipped=%, total=%',
    given_count, pending_count, skipped_count, total_count;

  -- Expected: 1 given, 3 pending, 1 skipped, 5 total
  IF given_count = 1 AND pending_count = 3 AND skipped_count = 1 AND total_count = 5 THEN
    RAISE NOTICE '[PASS] Progress counts correct';
  ELSE
    RAISE NOTICE '[FAIL] Progress counts incorrect';
    RAISE NOTICE '       Expected: given=1, pending=3, skipped=1, total=5';
    all_passed := FALSE;
  END IF;

  -- Test progress percentage calculation
  DECLARE
    progress_pct NUMERIC;
  BEGIN
    progress_pct := ROUND((given_count::NUMERIC / NULLIF(total_count, 0)) * 100, 1);
    RAISE NOTICE '       Progress percentage: % percent (given/total)', progress_pct;

    IF progress_pct = 20.0 THEN
      RAISE NOTICE '[PASS] Progress percentage calculation correct (20 percent)';
    ELSE
      RAISE NOTICE '[FAIL] Progress percentage expected 20 percent, got %', progress_pct;
      all_passed := FALSE;
    END IF;
  END;

  -- ==========================================
  -- CLEANUP
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'CLEANUP';
  RAISE NOTICE '----------------------------------------';

  DELETE FROM medication_doses WHERE medication_id = test_med_id;
  DELETE FROM medications WHERE id = test_med_id;

  -- Verify cleanup
  SELECT COUNT(*) INTO total_count
  FROM medication_doses WHERE medication_id = test_med_id;

  IF total_count = 0 THEN
    RAISE NOTICE '[PASS] Test data cleaned up successfully';
  ELSE
    RAISE NOTICE '[FAIL] Cleanup incomplete, % doses remain', total_count;
    all_passed := FALSE;
  END IF;

  -- ==========================================
  -- SUMMARY
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  IF all_passed THEN
    RAISE NOTICE 'ALL TESTS PASSED';
  ELSE
    RAISE NOTICE 'SOME TESTS FAILED - Review output above';
  END IF;
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';

END $$;
