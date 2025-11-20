-- Migration: Create medication_reminders_log table to prevent duplicate SMS
-- Purpose: Track sent reminders to ensure each medication reminder is only sent once per day/time
-- Date: 2025-11-19

-- Create the log table
CREATE TABLE IF NOT EXISTS medication_reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid REFERENCES medications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reminder_date date NOT NULL,
  reminder_time text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  message_id text, -- Twilio message SID for tracking
  created_at timestamp with time zone DEFAULT now(),

  -- Ensure we can only log one reminder per medication/date/time combo
  CONSTRAINT unique_reminder_per_day UNIQUE(medication_id, reminder_date, reminder_time)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_med_reminders_log_date
  ON medication_reminders_log(reminder_date);

CREATE INDEX IF NOT EXISTS idx_med_reminders_log_user
  ON medication_reminders_log(user_id, reminder_date);

CREATE INDEX IF NOT EXISTS idx_med_reminders_log_medication
  ON medication_reminders_log(medication_id, reminder_date);

-- Add RLS policies
ALTER TABLE medication_reminders_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own reminder logs
CREATE POLICY "Users can view own reminder logs"
  ON medication_reminders_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can insert (for cron jobs)
CREATE POLICY "Service role can insert reminder logs"
  ON medication_reminders_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can't directly insert/update/delete (only cron can)
-- This prevents users from manipulating the deduplication log

COMMENT ON TABLE medication_reminders_log IS 'Tracks sent medication reminders to prevent duplicate SMS';
COMMENT ON COLUMN medication_reminders_log.reminder_date IS 'Date the reminder was sent (PST timezone)';
COMMENT ON COLUMN medication_reminders_log.reminder_time IS 'Time the reminder was sent (HH:MM format in PST)';
COMMENT ON COLUMN medication_reminders_log.message_id IS 'Twilio message SID for delivery tracking';
