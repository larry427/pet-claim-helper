-- Add signature and insurance fields to profiles table
-- Add breed and date_of_birth to pets table
-- Required for official insurance form submission

-- Profiles table updates
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS signature TEXT,
ADD COLUMN IF NOT EXISTS insurance_company TEXT,
ADD COLUMN IF NOT EXISTS policy_number TEXT;

-- Comment columns
COMMENT ON COLUMN profiles.signature IS 'Base64 encoded signature image for claim forms';
COMMENT ON COLUMN profiles.insurance_company IS 'User''s pet insurance provider (Nationwide, Healthy Paws, Trupanion, etc.)';
COMMENT ON COLUMN profiles.policy_number IS 'Insurance policy number for claim submission';

-- Pets table updates
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS breed TEXT;

-- Comment columns
COMMENT ON COLUMN pets.date_of_birth IS 'Pet''s date of birth (used for age calculation on claim forms)';
COMMENT ON COLUMN pets.breed IS 'Pet breed (required for some insurance forms)';

-- Verify changes
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Added signature, insurance_company, policy_number to profiles';
  RAISE NOTICE 'Migration complete: Added date_of_birth, breed to pets';
END $$;
