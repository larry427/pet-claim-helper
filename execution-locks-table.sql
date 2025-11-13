-- Migration: Create execution_locks table to prevent duplicate cron job executions
-- This prevents race conditions when multiple server instances run simultaneously

CREATE TABLE IF NOT EXISTS execution_locks (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_execution_locks_created_at ON execution_locks(created_at);

-- Optional: Add cleanup function to delete old locks (older than 1 day)
-- Run this periodically or add as a cron job
CREATE OR REPLACE FUNCTION cleanup_old_execution_locks()
RETURNS void AS $$
BEGIN
  DELETE FROM execution_locks WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE execution_locks IS 'Prevents duplicate cron job executions across multiple server instances';
COMMENT ON COLUMN execution_locks.key IS 'Unique lock identifier (e.g., deadline-notifications-lock-2025-01-13)';
COMMENT ON COLUMN execution_locks.created_at IS 'When the lock was acquired';
