-- Add healthy_paws_pet_id column to pets table
-- This is required for Healthy Paws claims to save the Pet ID

ALTER TABLE pets
ADD COLUMN IF NOT EXISTS healthy_paws_pet_id TEXT;

-- Add comment to document the field
COMMENT ON COLUMN pets.healthy_paws_pet_id IS 'Healthy Paws Pet ID (e.g., 1400806-1) - found on insurance card';
