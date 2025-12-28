-- Migration: Add admin policy for food_entries table
-- Created: 2024-12-26
-- Purpose: Allow admins to view all food entries in admin dashboard

-- Add admin SELECT policy to food_entries table
CREATE POLICY "Admins can view all food entries"
ON food_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_admin = true
  )
);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'food_entries'
AND policyname = 'Admins can view all food entries';
