-- Fix Bug #1: Remove NOT NULL constraint from pet_id
-- This constraint exists in production but not in the schema
-- It causes 409 Conflict errors when saving claims without a pet selected

-- Remove the NOT NULL constraint from pet_id
ALTER TABLE claims ALTER COLUMN pet_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN claims.pet_id IS 'Pet ID - nullable to allow claims without a specific pet (e.g., multi-pet or unassigned claims)';
