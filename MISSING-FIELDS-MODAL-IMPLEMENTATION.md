# Missing Fields Modal - Implementation Guide

**Status**: ✅ Backend Complete | ⏳ Frontend Integration Pending
**Environment**: LOCAL ONLY - Feature-flagged (VITE_ENABLE_AUTO_SUBMIT)
**DO NOT PUSH TO PRODUCTION**

---

## Overview

Auto-submit claims with just-in-time data collection. When a user clicks "Auto-Submit", the system:
1. Checks what data is missing for that specific insurer
2. Shows a modal to collect only the required fields
3. Saves the data to the database (reusable for future claims)
4. Proceeds with claim submission

---

## ✅ What's Been Implemented

### 1. MissingFieldsModal Component
**File**: `src/components/MissingFieldsModal.tsx`

**Features**:
- Dynamic form rendering based on missing fields
- Support for 5 field types: `signature`, `text`, `date`, `phone`, `radio`
- Pre-fills with AI-suggested values when available
- Conditional field logic (e.g., spay/neuter date only if status = "Yes")
- Form validation (all required fields must be filled)
- Clean, polished UI matching app design

**Field Types Supported**:

| Type | Example | Features |
|------|---------|----------|
| `signature` | Digital signature | Canvas with clear button |
| `text` | Body part affected, Vet name | AI suggestions shown as hints |
| `date` | Adoption date, Spay/neuter date | Date picker |
| `phone` | Phone number | Tel input with formatting |
| `radio` | Spay/neuter status (Yes/No/Unknown) | Radio buttons with conditional fields |

### 2. Backend API Endpoint
**File**: `server/index.js` (lines 925-1056)

**Endpoint**: `POST /api/claims/:claimId/save-collected-fields`

**Request Body**:
```json
{
  "collectedData": {
    "signature": "data:image/png;base64,...",
    "address": "123 Main St, City, ST 12345",
    "policyholderPhone": "(555) 123-4567",
    "adoptionDate": "2020-01-15",
    "spayNeuterStatus": "Yes",
    "spayNeuterDate": "2020-06-01",
    "treatingVet": "Dr. Smith",
    "bodyPartAffected": "Ear"
  }
}
```

**What It Does**:
1. Looks up claim to find `user_id` and `pet_id`
2. Saves signature, address, phone to `profiles` table
3. Saves adoption date, spay/neuter info, vet name to `pets` table
4. Returns success confirmation

**Note**: `bodyPartAffected` is claim-specific and NOT saved to database - it's passed directly to PDF generation.

---

## ⏳ What Still Needs Integration

### Frontend Integration with Auto-Submit Flow

**Location**: Component with "Auto-Submit" button (likely in vet bill card or claim submission area)

**Required State**:
```tsx
const [showMissingFieldsModal, setShowMissingFieldsModal] = useState(false)
const [missingFieldsData, setMissingFieldsData] = useState(null)
const [isSubmitting, setIsSubmitting] = useState(false)
```

**Flow to Implement**:

#### Step 1: Handle Auto-Submit Click
```tsx
const handleAutoSubmit = async (insurerName) => {
  try {
    setIsSubmitting(true)

    // Check what fields are missing for this insurer
    const response = await fetch('/api/claims/validate-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: claim.id,
        userId: userId,
        insurer: insurerName.toLowerCase()
      })
    })

    const validation = await response.json()

    if (!validation.ok) {
      alert('Error checking claim requirements')
      return
    }

    // If fields are missing, show modal
    if (validation.missingFields && validation.missingFields.length > 0) {
      setMissingFieldsData({
        insurerName,
        missingFields: validation.missingFields,
        existingData: validation.existingData,
        suggestedValues: validation.suggestedValues
      })
      setShowMissingFieldsModal(true)
      return
    }

    // If no fields missing, proceed directly to submission
    await submitClaim(insurerName, {})

  } catch (error) {
    console.error('Auto-submit error:', error)
    alert('Error preparing claim submission')
  } finally {
    setIsSubmitting(false)
  }
}
```

#### Step 2: Handle Missing Fields Completion
```tsx
const handleMissingFieldsComplete = async (collectedData) => {
  try {
    // Save collected data to database
    const saveResponse = await fetch(`/api/claims/${claim.id}/save-collected-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectedData })
    })

    const saveResult = await saveResponse.json()

    if (!saveResult.ok) {
      alert('Error saving claim data')
      return
    }

    // Close modal
    setShowMissingFieldsModal(false)

    // Proceed with claim submission
    await submitClaim(missingFieldsData.insurerName, collectedData)

  } catch (error) {
    console.error('Error saving fields:', error)
    alert('Error saving claim information')
  }
}
```

#### Step 3: Render Modal in JSX
```tsx
{showMissingFieldsModal && missingFieldsData && (
  <MissingFieldsModal
    open={showMissingFieldsModal}
    onClose={() => setShowMissingFieldsModal(false)}
    insurerName={missingFieldsData.insurerName}
    petId={claim.pet_id}
    claimId={claim.id}
    missingFields={missingFieldsData.missingFields}
    existingData={missingFieldsData.existingData || {}}
    suggestedValues={missingFieldsData.suggestedValues || {}}
    onComplete={handleMissingFieldsComplete}
  />
)}
```

---

## Testing Instructions

### Prerequisites
1. Set `VITE_ENABLE_AUTO_SUBMIT=true` in `.env.local`
2. Run `npm run dev` locally
3. Have pets with insurance configured
4. Have vet bills uploaded

### Test Scenarios

#### Scenario 1: User Missing Signature
**Setup**: User has no signature saved in profile
**Expected**:
1. Click "Auto-Submit to Nationwide"
2. Modal appears with signature canvas
3. Draw signature
4. Click "Continue to Submit"
5. Signature saves to database
6. Claim proceeds to submission

#### Scenario 2: Nationwide Claim
**Setup**: User has signature, no vet name or body part saved
**Expected**:
1. Click "Auto-Submit to Nationwide"
2. Modal shows:
   - Treating Veterinarian (text field)
   - Body Part Affected (text field with AI suggestion from diagnosis)
3. Fill fields
4. Submit and verify data saves

#### Scenario 3: Trupanion Claim
**Setup**: User has signature, missing Trupanion-specific fields
**Expected**:
1. Click "Auto-Submit to Trupanion"
2. Modal shows:
   - Phone Number (tel field)
   - Adoption Date (date field)
   - Spay/Neuter Status (radio: Yes/No/Unknown)
   - Spay/Neuter Date (conditional - only if status = "Yes")
   - Treating Veterinarian (text field)
3. Fill all fields
4. If selecting "Yes" for spay/neuter, date field appears
5. Submit and verify all data saves correctly

#### Scenario 4: All Fields Present
**Setup**: User has all required fields for insurer
**Expected**:
1. Click "Auto-Submit to Healthy Paws"
2. No modal appears (all fields present)
3. Proceeds directly to claim submission

#### Scenario 5: Validation - Incomplete Form
**Setup**: Modal with multiple fields
**Expected**:
1. Leave one field empty
2. Click "Continue to Submit"
3. See error: "Please fill out all required fields"
4. Submit button stays disabled until all filled

### Verification Checklist

- [ ] Modal appears when fields are missing
- [ ] Modal does NOT appear when all fields present
- [ ] Signature canvas works (draw + clear)
- [ ] AI suggestions appear for bodyPartAffected
- [ ] Date picker works correctly
- [ ] Phone input accepts formatting
- [ ] Radio buttons trigger conditional fields
- [ ] Form validates all required fields
- [ ] Submit button disabled when incomplete
- [ ] Data saves to correct database tables
- [ ] Modal closes after successful save
- [ ] Claim proceeds to submission after save
- [ ] Error handling works (network failures, validation)

---

## Database Schema

### Fields Saved to `profiles` Table
- `signature` (TEXT) - Base64 PNG data
- `address` (TEXT) - Full mailing address
- `phone` (TEXT) - Phone number (E.164 format preferred)

### Fields Saved to `pets` Table
- `adoption_date` (DATE) - When pet was adopted
- `spay_neuter_status` (TEXT) - "Yes", "No", or "Unknown"
- `spay_neuter_date` (DATE) - Only if status is "Yes"
- `preferred_vet_name` (TEXT) - Treating veterinarian name

### Fields NOT Saved (Claim-Specific)
- `bodyPartAffected` - Passed directly to PDF generation, not stored

---

## Insurer Field Requirements

From `server/lib/claimFormMappings.js`:

### Nationwide
**Required Fields**:
- Signature
- Policyholder Name
- Policy Number
- Body Part Affected (AI-extractable)
- Treating Vet (optional)

### Trupanion
**Required Fields**:
- Signature
- Policyholder Name
- Phone Number
- Policy Number (optional - "if known")
- Treating Veterinarian
- Adoption Date
- Spay/Neuter Status
- Spay/Neuter Date (conditional - only if status = "Yes")

### Healthy Paws
**Required Fields**:
- Signature
- Policyholder Name
- Policy Number

---

## AI-Powered Extraction

The system uses OpenAI GPT-4o-mini to extract `bodyPartAffected` from diagnosis text.

**Example**:
- **Diagnosis**: "Ear infection - treated with antibiotics"
- **AI Extraction**: "Ear"
- **User Experience**: Field pre-filled with "Ear", user can edit if needed

**Cost**: ~$0.0001 per extraction (extremely cheap)

---

## Error Handling

### User-Facing Errors
- "Please fill out all required fields" - Form validation
- "Error checking claim requirements" - API validation failed
- "Error saving claim data" - Database save failed
- "Error saving claim information" - Network or server error

### Console Logs
All operations log to console with `[Save Collected Fields]` prefix for debugging.

---

## Next Steps

1. **Find Auto-Submit Button Location**
   - Search for "Auto-Submit" in codebase
   - Likely in vet bill card component or claim submission flow

2. **Add Integration Code**
   - Add state variables
   - Implement `handleAutoSubmit`
   - Implement `handleMissingFieldsComplete`
   - Render `<MissingFieldsModal>` component

3. **Test Thoroughly**
   - Test all insurers (Nationwide, Trupanion, Healthy Paws)
   - Test all field types
   - Test validation and error cases
   - Verify database saves

4. **Connect to PDF Generation**
   - Pass collected data to PDF generation function
   - Ensure `bodyPartAffected` flows to form filling
   - Test filled PDFs are correct

---

## Important Notes

⚠️ **DO NOT PUSH TO PRODUCTION**
This feature is behind the `VITE_ENABLE_AUTO_SUBMIT` feature flag and should remain LOCAL ONLY for now.

✅ **Data Persistence**
All collected fields are saved to the database and reused for future claims, reducing friction over time.

🤖 **AI Assistance**
AI suggestions help users fill forms faster with smart defaults they can override.

🔒 **User Control**
Users always review and approve before submission - we never auto-submit without explicit confirmation.

---

## Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| MissingFieldsModal | ✅ Complete | `src/components/MissingFieldsModal.tsx` |
| Backend API | ✅ Complete | `server/index.js:925-1056` |
| Frontend Integration | ⏳ Pending | TBD (find Auto-Submit button) |
| PDF Generation Integration | ⏳ Pending | TBD |
| End-to-End Testing | ⏳ Pending | After integration |

---

## Questions?

Check the following files for reference:
- `server/lib/claimFormMappings.js` - Field requirements per insurer
- `server/JUST-IN-TIME-DATA-COLLECTION-STATUS.md` - Original spec
- `server/index.js:792-878` - Validate fields endpoint

The backend is ready. Frontend integration is the final step! 🚀
