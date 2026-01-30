-- Migration: Simplify medication doses tracking
-- Instead of pre-generating dose records, we now just log when doses are given.
-- This migration adds a dose_date column for easier "was dose given today?" queries.

-- Add dose_date column (the date this dose is for, extracted from given_time or scheduled_time)
ALTER TABLE medication_doses ADD COLUMN IF NOT EXISTS dose_date DATE;

-- Backfill existing records: extract date from scheduled_time or given_time
UPDATE medication_doses
SET dose_date = COALESCE(
  DATE(given_time AT TIME ZONE 'America/Los_Angeles'),
  DATE(scheduled_time AT TIME ZONE 'America/Los_Angeles')
)
WHERE dose_date IS NULL;

-- Create index for the simplified query pattern (checking if dose given on a date)
CREATE INDEX IF NOT EXISTS idx_medication_doses_date
ON medication_doses(medication_id, dose_date);

-- Create index for finding doses given today
CREATE INDEX IF NOT EXISTS idx_medication_doses_given_today
ON medication_doses(medication_id, dose_date, status)
WHERE status = 'given';

-- Add a unique constraint to prevent duplicate log entries for same medication + date + time slot
-- This allows multiple doses per day (e.g., 2x daily) by including the time
CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_doses_unique_log
ON medication_doses(medication_id, dose_date, EXTRACT(HOUR FROM COALESCE(scheduled_time, given_time)))
WHERE status = 'given';

COMMENT ON COLUMN medication_doses.dose_date IS 'The date this dose is for (in PST). Used for simple "given today?" queries.';
