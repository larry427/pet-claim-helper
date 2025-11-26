-- Migration: Add Trupanion-specific fields to pets table
-- Run this in Supabase SQL editor

-- Add columns for other insurance history
ALTER TABLE pets ADD COLUMN IF NOT EXISTS had_other_insurance BOOLEAN;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS other_insurance_provider TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS other_insurance_cancel_date DATE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS other_insurance_still_active BOOLEAN;

-- Add column for hospital visit history
ALTER TABLE pets ADD COLUMN IF NOT EXISTS other_hospitals_visited TEXT;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pets'
  AND column_name IN (
    'had_other_insurance',
    'other_insurance_provider',
    'other_insurance_cancel_date',
    'other_insurance_still_active',
    'other_hospitals_visited',
    'adoption_date',
    'spay_neuter_status',
    'spay_neuter_date',
    'preferred_vet_name'
  )
ORDER BY column_name;
