-- Add pumpkin_account_number column to pets table
-- This is required for Pumpkin claims to save the Account Number

ALTER TABLE pets
ADD COLUMN IF NOT EXISTS pumpkin_account_number TEXT;

-- Add comment to document the field
COMMENT ON COLUMN pets.pumpkin_account_number IS 'Pumpkin Account Number - found on Pumpkin policy documents or portal';
