-- FIX: Add missing columns and unique constraint to medication_reminders_log
-- This prevents duplicate SMS sends due to race conditions

-- 1. Add missing columns
ALTER TABLE medication_reminders_log
ADD COLUMN IF NOT EXISTS message_id text,
ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone DEFAULT now();

-- 2. Add the critical unique constraint to prevent duplicates
-- This will FAIL if duplicates already exist, so we need to clean them up first

-- First, identify and keep only the FIRST occurrence of each duplicate
-- (Delete subsequent duplicates based on created_at timestamp)
DELETE FROM medication_reminders_log a
USING medication_reminders_log b
WHERE
  a.medication_id = b.medication_id AND
  a.reminder_date = b.reminder_date AND
  a.reminder_time = b.reminder_time AND
  a.created_at > b.created_at; -- Keep the earlier one

-- Now add the unique constraint
ALTER TABLE medication_reminders_log
ADD CONSTRAINT unique_reminder_per_day
UNIQUE(medication_id, reminder_date, reminder_time);

-- Verify the constraint was added
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'medication_reminders_log'::regclass
  AND conname = 'unique_reminder_per_day';
