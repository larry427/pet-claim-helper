-- Enable RLS on execution_locks table (used for cron job locking)
-- This table should only be accessible by service role (backend/cron)

ALTER TABLE public.execution_locks ENABLE ROW LEVEL SECURITY;

-- Add a policy - service role only (for cron jobs and backend operations)
CREATE POLICY "Service role only" ON public.execution_locks
FOR ALL USING (auth.role() = 'service_role');
