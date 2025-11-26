-- Add mailing address and phone to profiles table
-- Required for insurance claim forms (policyholder address and phone)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add comments for documentation
COMMENT ON COLUMN profiles.address IS 'Policyholder mailing address (required for Nationwide and Healthy Paws claim forms)';
COMMENT ON COLUMN profiles.phone IS 'Policyholder phone number (required for most insurance claim forms)';

-- Verify changes
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Added address, phone to profiles';
END $$;
