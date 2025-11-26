-- Add clinic_phone column to claims table for storing veterinary clinic phone numbers
-- This field is extracted from vet bills via OpenAI Vision API

ALTER TABLE claims ADD COLUMN IF NOT EXISTS clinic_phone TEXT;

-- Add comment for documentation
COMMENT ON COLUMN claims.clinic_phone IS 'Veterinary clinic phone number extracted from vet bills';
