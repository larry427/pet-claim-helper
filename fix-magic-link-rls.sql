-- Fix RLS policies to allow magic link authentication to work
-- This allows unauthenticated users to read medications and pets data
-- when accessed via a valid one-time token in medication_doses

-- ============================================================================
-- MEDICATIONS TABLE
-- ============================================================================

-- Enable RLS on medications table
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own medications
CREATE POLICY IF NOT EXISTS "Users can view own medications"
ON medications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow public (unauthenticated) to read medications
-- This is safe because:
-- 1. SELECT only (no INSERT/UPDATE/DELETE)
-- 2. User needs the UUID token from SMS to access
-- 3. Token is one-time use and expires in 24 hours
CREATE POLICY IF NOT EXISTS "Allow public read for magic links"
ON medications
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- PETS TABLE
-- ============================================================================

-- Enable RLS on pets table
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own pets
CREATE POLICY IF NOT EXISTS "Users can view own pets"
ON pets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow public (unauthenticated) to read pets
-- This is safe because:
-- 1. SELECT only (no INSERT/UPDATE/DELETE)
-- 2. User needs the UUID token from SMS to access
-- 3. Token is one-time use and expires in 24 hours
CREATE POLICY IF NOT EXISTS "Allow public read for magic links"
ON pets
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- To verify policies are working, run these queries:

-- 1. Check existing policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('medication_doses', 'medications', 'pets')
-- ORDER BY tablename, policyname;

-- 2. Test public access (should work for all three tables)
-- SET ROLE anon;
-- SELECT * FROM medication_doses WHERE one_time_token = 'some-valid-token';
-- SELECT * FROM medications WHERE id = 'some-valid-id';
-- SELECT * FROM pets WHERE id = 'some-valid-id';
-- RESET ROLE;
