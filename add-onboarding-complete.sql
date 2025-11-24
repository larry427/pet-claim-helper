-- Add onboarding_complete flag to profiles table
-- This prevents the onboarding modal from showing again after completion

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;

-- Set existing users who have pets as having completed onboarding
UPDATE profiles
SET onboarding_complete = true
WHERE id IN (
  SELECT DISTINCT user_id
  FROM pets
);
