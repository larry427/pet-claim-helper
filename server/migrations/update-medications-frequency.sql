-- Update medications table frequency constraint to include new values
-- Migration: 2025-12-31 - Add weekly, monthly, quarterly, and as-needed frequencies

-- Drop the old CHECK constraint on frequency column
ALTER TABLE public.medications
  DROP CONSTRAINT IF EXISTS medications_frequency_check;

-- Add new CHECK constraint with expanded frequency options
ALTER TABLE public.medications
  ADD CONSTRAINT medications_frequency_check
  CHECK (frequency IN (
    -- Legacy daily options (keep for backward compatibility)
    '1x daily',
    '2x daily',
    '3x daily',
    -- New frequency options
    'Once daily',
    'Twice daily',
    'Three times daily',
    'Weekly',
    'Monthly',
    'Every 3 months',
    'As needed'
  ));

-- Add comment explaining the migration
COMMENT ON CONSTRAINT medications_frequency_check ON public.medications IS
  'Frequency constraint updated 2025-12-31 to support daily, weekly, monthly, quarterly, and as-needed medications. Legacy daily formats (1x daily, 2x daily, 3x daily) preserved for backward compatibility.';
