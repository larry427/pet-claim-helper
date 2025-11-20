-- Migration: Add is_admin column to profiles table
-- Created: 2025-11-20
-- Purpose: Enable admin dashboard access control

-- Add is_admin column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- Set larry@uglydogadventures.com as admin
UPDATE profiles
SET is_admin = true
WHERE email = 'larry@uglydogadventures.com';

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_admin IS 'Flag to indicate if user has admin dashboard access';

-- Verify the change
SELECT email, full_name, is_admin
FROM profiles
WHERE email = 'larry@uglydogadventures.com';
