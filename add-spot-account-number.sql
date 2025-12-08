-- Add spot_account_number and gender columns to pets table
-- Run this in Supabase SQL Editor

-- Add spot_account_number column
ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT;

-- Add gender column
ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT;
