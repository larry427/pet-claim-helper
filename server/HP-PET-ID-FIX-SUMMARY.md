# Healthy Paws Pet ID Persistence Fix

## Problem Identified
HP Pet ID was not being saved to the database, causing users to be asked for it on every claim.

## Root Causes Found

### 1. Missing Database Column ❌
The `pets` table was missing the `healthy_paws_pet_id` column.

**Status**: ⚠️ NEEDS MANUAL FIX

### 2. Missing Save Logic ✅ FIXED
The `/api/claims/:claimId/save-collected-fields` endpoint was not saving `healthyPawsPetId` to the database.

**Fix Applied**: Added save logic at `server/index.js:1086-1098`
```javascript
// Save healthy_paws_pet_id to pets table
if (collectedData.healthyPawsPetId) {
  const { error: hpPetIdError } = await supabase
    .from('pets')
    .update({ healthy_paws_pet_id: collectedData.healthyPawsPetId })
    .eq('id', petId)

  if (hpPetIdError) {
    console.error('[Save Collected Fields] Error saving HP Pet ID:', hpPetIdError)
  } else {
    console.log('[Save Collected Fields] Saved HP Pet ID:', collectedData.healthyPawsPetId)
  }
}
```

### 3. Missing Database Fetch ✅ FIXED
The `/api/claims/submit` endpoint was not fetching `healthy_paws_pet_id` from the database.

**Fix Applied**: Added to SELECT query at `server/index.js:1227`
```javascript
pets (
  name,
  species,
  breed,
  date_of_birth,
  policy_number,
  insurance_company,
  preferred_vet_name,
  adoption_date,
  spay_neuter_status,
  spay_neuter_date,
  healthy_paws_pet_id  // ← ADDED
)
```

## Manual Action Required

**YOU MUST RUN THIS SQL** in Supabase Dashboard > SQL Editor:

```sql
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS healthy_paws_pet_id TEXT;

COMMENT ON COLUMN pets.healthy_paws_pet_id IS 'Healthy Paws Pet ID (e.g., 1400806-1) - found on insurance card';
```

## Deployment Status

✅ Backend code deployed to Render
⚠️ Waiting for SQL migration to be run manually

## Testing After SQL Migration

1. Go to pet-claim-helper.vercel.app
2. Start Auto-Submit for a Healthy Paws pet (Bo)
3. Enter HP Pet ID when prompted (e.g., "1400806-1")
4. Submit the claim
5. Start Auto-Submit again for the same pet
6. ✅ Should NOT ask for HP Pet ID again - it should be auto-filled

## Files Changed

- `server/index.js` - Added save logic and database fetch
- `add-hp-pet-id-migration.sql` - SQL migration file (ready to run)
