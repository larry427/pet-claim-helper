-- Migration: Add pet insurance fields for just-in-time data collection
-- Purpose: Store reusable pet information needed for insurance claim forms
-- These fields are collected once and reused across all insurers

-- Add adoption date (required by Trupanion)
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS adoption_date DATE;

-- Add spay/neuter information (required by Trupanion)
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS spay_neuter_status TEXT
CHECK (spay_neuter_status IN ('Yes', 'No', 'Unknown'));

ALTER TABLE pets
ADD COLUMN IF NOT EXISTS spay_neuter_date DATE;

-- Add preferred veterinarian (required by Trupanion, optional for Nationwide)
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS preferred_vet_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN pets.adoption_date IS 'Date the pet was adopted - required by Trupanion';
COMMENT ON COLUMN pets.spay_neuter_status IS 'Spay/neuter status: Yes, No, or Unknown - required by Trupanion';
COMMENT ON COLUMN pets.spay_neuter_date IS 'Date pet was spayed/neutered - required if spay_neuter_status = Yes';
COMMENT ON COLUMN pets.preferred_vet_name IS 'Name of treating veterinarian - required by Trupanion';

-- No need to drop or rollback - these are additive-only changes
