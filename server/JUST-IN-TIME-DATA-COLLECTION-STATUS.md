# Just-in-Time Data Collection - Implementation Status

## Overview
Implement smart data collection that only asks for missing fields when submitting a claim to a specific insurer, rather than during onboarding.

## ✅ COMPLETED

### 1. Database Migration
**File**: `server/migrations/add-pet-insurance-fields.sql`

Added new columns to `pets` table:
- `adoption_date` (DATE) - Required by Trupanion
- `spay_neuter_status` (TEXT) - Values: 'Yes', 'No', 'Unknown'
- `spay_neuter_date` (DATE) - Required if spayed/neutered
- `preferred_vet_name` (TEXT) - Required by Trupanion, optional for Nationwide

**Status**: Migration file created. **ACTION REQUIRED**: Run in Supabase SQL Editor
```sql
-- Copy contents of server/migrations/add-pet-insurance-fields.sql
-- and run in Supabase Dashboard > SQL Editor
```

### 2. Insurer Requirements Mapping
**File**: `server/lib/claimFormMappings.js`

Added comprehensive field requirements for each insurer:

**Nationwide Requirements**:
- Signature (required)
- Policyholder name (required)
- Policy number (required)
- Body part affected (required, AI-extractable from diagnosis)
- Treating vet (optional)

**Trupanion Requirements**:
- Signature (required)
- Policyholder name (required)
- Phone number (required)
- Policy number (optional - "if known")
- Treating veterinarian (required)
- Adoption date (required)
- Spay/neuter status (required)
- Spay/neuter date (conditional - only if status = 'Yes')

**Healthy Paws Requirements**:
- Signature (required)
- Policyholder name (required)
- Policy number (required)

**New Functions**:
- `getRequiredFieldsForInsurer(insurerName)` - Get field requirements
- `getMissingRequiredFields(insurer, profile, pet, claim)` - Check what's missing

### 3. API Endpoint for Field Validation
**File**: `server/index.js` (line 791-923)

**Endpoint**: `POST /api/claims/validate-fields`

**Request Body**:
```json
{
  "claimId": "uuid",
  "userId": "uuid",
  "insurer": "Nationwide" | "Trupanion" | "Healthy Paws"
}
```

**Response**:
```json
{
  "ok": true,
  "missingFields": [
    {
      "field": "bodyPartAffected",
      "source": "claim.body_part",
      "required": true,
      "type": "text",
      "prompt": "What part of your pet's body was affected?",
      "placeholder": "e.g., Ear, Eye, Leg, Stomach",
      "aiExtract": true,
      "suggestedValue": "Ear" // AI-extracted from diagnosis
    }
  ],
  "allFieldsPresent": false
}
```

**Features**:
- Validates all required fields for the specific insurer
- AI-powered extraction for `bodyPartAffected` from diagnosis text
- Returns suggested values that can be pre-filled
- Handles conditional fields (e.g., spay/neuter date only if spayed)

## 🚧 IN PROGRESS

### 4. Frontend Data Collection Modal
**File**: `src/components/ClaimSubmissionModal.tsx`

**What Needs to Be Done**:

1. **Replace validation logic** (lines 26-73):
   - Remove hardcoded validation
   - Call `/api/claims/validate-fields` API endpoint
   - Handle response with missing fields

2. **Add new step** to flow:
   ```
   validating → collect-fields → collect-address → confirm → submitting → success
   ```

3. **Add state for field collection**:
   ```typescript
   const [missingFields, setMissingFields] = useState<any[]>([])
   const [fieldValues, setFieldValues] = useState<Record<string, any>>({})
   ```

4. **Create dynamic form renderer** that handles:
   - Text inputs (name, vet name, body part)
   - Date inputs (adoption date, spay/neuter date)
   - Phone inputs (formatted phone number)
   - Radio groups (spay/neuter status: Yes/No/Unknown)
   - Signature canvas (if signature missing)

5. **Pre-fill AI-suggested values**:
   ```typescript
   // When missingFields loaded
   const initialValues = {}
   missingFields.forEach(field => {
     if (field.suggestedValue) {
       initialValues[field.field] = field.suggestedValue
     }
   })
   setFieldValues(initialValues)
   ```

6. **Create save function**:
   ```typescript
   async function saveCollectedFields() {
     // Group fields by table (profiles, pets, claims)
     const profileUpdates = {}
     const petUpdates = {}
     const claimUpdates = {}

     // Map field names to database columns
     // Save to appropriate tables
     // Continue to next step (confirm)
   }
   ```

7. **Render collection modal UI**:
   - Title: "One More Thing... We need a few more details for {insurer}"
   - Description: "This information is required by {insurer} and will be saved for future claims"
   - Form with all missing fields
   - [Cancel] [Continue] buttons
   - Auto-focus first field
   - Enter key support

### 5. API Endpoint to Save Collected Data
**File**: `server/index.js` (needs to be added)

**Endpoint**: `POST /api/claims/save-collected-fields`

**Request Body**:
```json
{
  "userId": "uuid",
  "petId": "uuid",
  "claimId": "uuid",
  "fieldValues": {
    "bodyPartAffected": "Ear",
    "treatingVet": "Dr. Smith",
    "adoptionDate": "2020-01-15",
    "spayNeuterStatus": "Yes",
    "spayNeuterDate": "2020-06-01"
  }
}
```

**Logic**:
1. Map field names to database columns
2. Update `profiles` table (signature, policy number, etc.)
3. Update `pets` table (adoption_date, spay_neuter_status, preferred_vet_name)
4. Update `claims` table (body_part, etc.)
5. Return success

## 📋 TODO

### 6. Testing
- [ ] Test Nationwide flow (body part extraction from diagnosis)
- [ ] Test Trupanion flow (adoption date, spay/neuter, vet name)
- [ ] Test Healthy Paws flow (simple requirements)
- [ ] Test conditional fields (spay/neuter date only if Yes)
- [ ] Test AI extraction accuracy for body parts
- [ ] Test data persistence across multiple claims

### 7. Edge Cases to Handle
- [ ] User cancels collection modal - don't submit claim
- [ ] AI extraction fails - show empty field for manual entry
- [ ] User changes insurer after collecting data - re-validate
- [ ] Missing signature - show signature canvas in collection modal
- [ ] Phone number formatting and validation
- [ ] Date validation (adoption date can't be in future)

## 🎯 BENEFITS

1. **Better UX**: Users aren't overwhelmed with fields during onboarding
2. **Insurer-Specific**: Only collect what each insurer actually needs
3. **AI-Powered**: Auto-extract data from existing information
4. **Reusable**: Data saved once, used for all future claims
5. **Complete Claims**: 100% field completion rate for submissions
6. **No Errors**: Validation happens before PDF generation

## 📊 FIELD COVERAGE BY INSURER

| Field | Nationwide | Trupanion | Healthy Paws |
|-------|-----------|-----------|--------------|
| Signature | Required | Required | Required |
| Policy Number | Required | Optional | Required |
| Policyholder Name | Required | Required | Required |
| Phone | Optional | Required | Optional |
| Body Part Affected | Required (AI) | N/A | N/A |
| Treating Vet | Optional | Required | N/A |
| Adoption Date | N/A | Required | N/A |
| Spay/Neuter Status | N/A | Required | N/A |
| Spay/Neuter Date | N/A | Conditional | N/A |

**Legend**:
- Required = Blocks submission if missing
- Optional = Collected if available, not required
- Conditional = Required only if another field has specific value
- N/A = Not used by this insurer
- (AI) = Can be auto-extracted from existing data

## 🚀 NEXT STEPS

1. **Run Database Migration**:
   - Open Supabase Dashboard > SQL Editor
   - Paste contents of `server/migrations/add-pet-insurance-fields.sql`
   - Execute

2. **Complete Frontend Modal** (biggest remaining task):
   - Update ClaimSubmissionModal.tsx
   - Add field collection UI
   - Add save logic

3. **Create Save Endpoint**:
   - Add `/api/claims/save-collected-fields` to server/index.js

4. **Test End-to-End**:
   - Test with all 3 insurers
   - Verify data persistence
   - Check PDF generation with new fields

5. **Production Deployment**:
   - Deploy database migration
   - Deploy updated code
   - Monitor for issues

## 📝 NOTES

- All field definitions support `{petName}` placeholder in prompts for personalization
- AI extraction uses GPT-4o-mini for cost efficiency
- Conditional logic supports nested conditions
- Field types: text, date, phone, radio, signature, checkbox
- All collected data is stored for future reuse
- Migration is safe to run multiple times (uses IF NOT EXISTS)
