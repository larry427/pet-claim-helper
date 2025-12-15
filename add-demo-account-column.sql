-- Add is_demo_account column to profiles table
-- Demo accounts route claims to larry@uglydogadventures.com for safe testing during sales calls
-- while BCCing the prospect so they see the email arrive in real-time

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_demo_account BOOLEAN DEFAULT false;
