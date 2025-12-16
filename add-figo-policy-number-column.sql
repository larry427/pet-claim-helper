-- Add figo_policy_number column to pets table
-- Figo insurance requires a policy number for claim submission
-- This field is used to populate the "Number_1" field in Figo's claim form PDF

ALTER TABLE pets ADD COLUMN IF NOT EXISTS figo_policy_number TEXT;
