-- Add spot_account_number column to pets table
ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT;
