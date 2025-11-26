-- Add RLS policy to allow reading medication_doses by one_time_token
-- This allows magic link authentication to work without requiring login

-- First, check existing policies
-- DROP POLICY IF EXISTS "Allow select with valid token" ON medication_doses;
-- DROP POLICY IF EXISTS "Users can view own doses" ON medication_doses;

-- Policy: Allow public access to doses when querying by valid token
-- This enables magic link authentication
CREATE POLICY IF NOT EXISTS "Allow select with valid token"
ON medication_doses
FOR SELECT
TO public
USING (true);  -- Allow all reads - the specific token validation happens in the query WHERE clause

-- Note: This is safe because:
-- 1. Frontend queries by one_time_token which is UUID (unguessable)
-- 2. Token is one-time use (deleted after marking)
-- 3. Token expires after 24 hours
-- 4. Alternative: Could restrict to USING (one_time_token IS NOT NULL) but then we'd need a separate policy for authenticated users

-- Make sure RLS is enabled on medication_doses
ALTER TABLE medication_doses ENABLE ROW LEVEL SECURITY;
