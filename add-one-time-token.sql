-- Add one_time_token column to medication_doses table for magic link auth
ALTER TABLE medication_doses
ADD COLUMN IF NOT EXISTS one_time_token UUID,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_medication_doses_token
ON medication_doses(one_time_token)
WHERE one_time_token IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN medication_doses.one_time_token IS 'One-time use token for SMS deep link authentication. Deleted after first use.';
COMMENT ON COLUMN medication_doses.token_expires_at IS 'Token expiration timestamp. Token invalid after this time.';
