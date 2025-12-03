-- Add short_code column to medication_doses table
-- This allows for shorter, cleaner SMS URLs like /dose/Xk7mP9ab
-- instead of /dose/511b2221-1b4f-4908-94bd-b59c2c6d5424?token=xyz

-- Add the column
ALTER TABLE medication_doses
ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Add unique constraint to ensure no duplicate short codes
ALTER TABLE medication_doses
ADD CONSTRAINT medication_doses_short_code_unique
UNIQUE (short_code);

-- Create index for fast lookups by short_code
CREATE INDEX IF NOT EXISTS idx_medication_doses_short_code
ON medication_doses(short_code);

-- Add comment for documentation
COMMENT ON COLUMN medication_doses.short_code IS '8-character alphanumeric code for short SMS URLs (e.g., Xk7mP9ab)';
