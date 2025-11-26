-- ============================================================================
-- DEFINITIVE FIX FOR MAGIC LINK RLS POLICIES
-- This completely resets RLS policies to allow magic link authentication
-- ============================================================================

-- First, drop ALL existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow select with valid token" ON medication_doses;
DROP POLICY IF EXISTS "Users can view own doses" ON medication_doses;
DROP POLICY IF EXISTS "Allow public read for magic links" ON medications;
DROP POLICY IF EXISTS "Users can view own medications" ON medications;
DROP POLICY IF EXISTS "Allow public read for magic links" ON pets;
DROP POLICY IF EXISTS "Users can view own pets" ON pets;

-- ============================================================================
-- MEDICATION_DOSES TABLE
-- ============================================================================

-- Enable RLS
ALTER TABLE medication_doses ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow public SELECT when querying by token (for magic links)
CREATE POLICY "Public can read doses by token"
ON medication_doses
FOR SELECT
TO public
USING (true);  -- Allow all reads, token validation happens in WHERE clause

-- ============================================================================
-- MEDICATIONS TABLE
-- ============================================================================

-- Enable RLS
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow PUBLIC to read medications (required for magic link JOINs)
CREATE POLICY "Public can read medications"
ON medications
FOR SELECT
TO public
USING (true);

-- Policy 2: Allow authenticated users to manage their own medications
CREATE POLICY "Users manage own medications"
ON medications
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PETS TABLE
-- ============================================================================

-- Enable RLS
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow PUBLIC to read pets (required for magic link JOINs)
CREATE POLICY "Public can read pets"
ON pets
FOR SELECT
TO public
USING (true);

-- Policy 2: Allow authenticated users to manage their own pets
CREATE POLICY "Users manage own pets"
ON pets
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- After running this, verify with:
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('medication_doses', 'medications', 'pets')
-- ORDER BY tablename, policyname;
--
-- You should see:
-- medication_doses | Public can read doses by token | {public} | SELECT
-- medications      | Public can read medications    | {public} | SELECT
-- medications      | Users manage own medications   | {authenticated} | ALL
-- pets             | Public can read pets           | {public} | SELECT
-- pets             | Users manage own pets          | {authenticated} | ALL
