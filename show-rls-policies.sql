-- Run this in Supabase SQL Editor to see all RLS policies
-- This will show us what's actually configured

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('medication_doses', 'medications', 'pets')
ORDER BY tablename, policyname;
