-- Migration: Add sms_opt_in column to profiles table
-- Run this in Supabase SQL Editor to add SMS opt-in tracking

-- Add sms_opt_in column (defaults to true for new users)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sms_opt_in boolean DEFAULT true;

-- For existing users, set sms_opt_in to true if they have a phone number
UPDATE public.profiles
SET sms_opt_in = true
WHERE phone IS NOT NULL AND phone != '';
