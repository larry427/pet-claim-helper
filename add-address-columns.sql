-- Migration: Add separate address columns to profiles table
-- Date: 2024-11-29
-- Purpose: Split address into separate fields for city, state, zip

-- Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN profiles.city IS 'User city from address';
COMMENT ON COLUMN profiles.state IS 'User state (2-letter code)';
COMMENT ON COLUMN profiles.zip IS 'User ZIP code';
