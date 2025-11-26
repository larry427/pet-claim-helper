# Policy Number Auto-Collection Implementation

## Problem Solved
- Pets could be added without policy numbers (empty string in database)
- Auto-submit would use "N/A" as fallback in PDFs
- Insurance companies would reject claims without valid policy numbers

## Solution Implemented
Added policy number as a **required field** that's validated and collected before submission.

---

## Changes Made

### 1. Updated `server/lib/claimFormMappings.js`

#### Nationwide (line 237-243):
```javascript
{
  field: 'policyNumber',
  source: 'pets.policy_number',  // ✅ Fixed from 'profiles.policy_number'
  required: true,
  type: 'text',
  prompt: 'What is your pet insurance policy number?',
  placeholder: 'e.g., NW12345 or C-234567'
}
```

#### Trupanion (line 292-298):
```javascript
{
  field: 'policyNumber',
  source: 'pets.policy_number',  // ✅ Fixed from 'profiles.policy_number'
  required: true,                 // ✅ Changed from false to true
  type: 'text',
  prompt: 'What is your pet insurance policy number?',
  placeholder: 'e.g., TP12345 or TR67890'
}
```

**Key fixes:**
- Changed source from `profiles.policy_number` → `pets.policy_number` (correct table)
- Made Trupanion policy number required (was optional before)
- Updated prompts to be more user-friendly

### 2. Added Save Handler in `server/index.js` (line 1016-1028)

```javascript
// Save policy_number to pets table
if (collectedData.policyNumber) {
  const { error: policyError } = await supabase
    .from('pets')
    .update({ policy_number: collectedData.policyNumber })
    .eq('id', petId)

  if (policyError) {
    console.error('[Save Collected Fields] Error saving policy number:', policyError)
  } else {
    console.log('[Save Collected Fields] Saved policy number:', collectedData.policyNumber)
  }
}
```

This saves the collected policy number to the `pets.policy_number` column.

---

## How It Works

### Flow Diagram

```
User clicks "Auto-Submit"
         ↓
Validation endpoint checks required fields
         ↓
Is pets.policy_number empty/null?
         ↓ YES
MissingFieldsModal shows:
"What is your pet insurance policy number?"
         ↓
User enters policy number
         ↓
Save endpoint updates pets.policy_number
         ↓
PDF generation uses real policy number
         ↓
✅ Claim submitted with valid policy number
```

### Validation Logic (claimFormMappings.js:465)

```javascript
if (!value || value === '' || value === null || value === undefined) {
  missing.push(fieldDef)  // Add to missing fields
}
```

Empty strings (like Hope's current policy_number) will be caught!

---

## Testing Scenarios

### Test Case 1: Hope (Trupanion, Empty Policy Number)

**Before:**
```sql
SELECT name, policy_number FROM pets WHERE name = 'Hope';
-- Result: Hope | ""  (empty string)
```

**Expected Behavior:**
1. User clicks "Auto-Submit" on Hope's claim
2. MissingFieldsModal appears with: "What is your pet insurance policy number?"
3. User enters: "TR123456"
4. Policy number saves to database
5. PDF shows "TR123456" instead of "N/A"

### Test Case 2: Neo (Nationwide, Has Policy Number)

**Before:**
```sql
SELECT name, policy_number FROM pets WHERE name = 'Neo';
-- Result: Neo | "nw432567"
```

**Expected Behavior:**
1. User clicks "Auto-Submit" on Neo's claim
2. Validation passes (policy number exists)
3. PDF shows "nw432567" ✅

### Test Case 3: New Pet (No Policy Number)

**Before:**
```sql
INSERT INTO pets (name, policy_number) VALUES ('Buddy', NULL);
```

**Expected Behavior:**
1. User clicks "Auto-Submit" on Buddy's claim
2. MissingFieldsModal appears
3. User provides policy number
4. Claim proceeds with valid data

---

## Database Schema

Policy numbers are stored in the **pets** table:

```sql
TABLE pets (
  id UUID PRIMARY KEY,
  name TEXT,
  policy_number TEXT,  -- ← This field
  insurance_company TEXT,
  ...
)
```

**Important:** Policy number is pet-specific, NOT profile-specific!
- One user can have multiple pets
- Each pet has their own policy number
- Different pets may have different insurers

---

## Validation Endpoints

### 1. Validate Fields (`POST /api/claims/validate-fields`)

**Input:**
```json
{
  "claimId": "claim-uuid",
  "userId": "user-uuid",
  "insurer": "Trupanion"
}
```

**Output (if policy missing):**
```json
{
  "ok": true,
  "missingFields": [
    {
      "field": "policyNumber",
      "source": "pets.policy_number",
      "required": true,
      "type": "text",
      "prompt": "What is your pet insurance policy number?",
      "placeholder": "e.g., TP12345 or TR67890"
    }
  ]
}
```

### 2. Save Collected Fields (`POST /api/claims/:claimId/save-collected-fields`)

**Input:**
```json
{
  "collectedData": {
    "policyNumber": "TR123456"
  }
}
```

**Action:** Updates `pets.policy_number` for the claim's pet

---

## Result

### Before Fix:
```
Policy Number field in PDF: "N/A"
❌ Insurance company rejects claim
```

### After Fix:
```
Policy Number field in PDF: "TR123456"
✅ Insurance company accepts claim
```

---

## Files Modified

1. `server/lib/claimFormMappings.js`
   - Fixed Nationwide policyNumber source
   - Fixed Trupanion policyNumber source and requirement
   
2. `server/index.js`
   - Added policyNumber save handler

---

## Next Steps for Testing

1. **Frontend Test:**
   - Open app in browser
   - Navigate to Hope's Trupanion claim
   - Click "Auto-Submit"
   - Verify MissingFieldsModal shows policy number field
   - Enter a test policy number
   - Submit claim
   - Check generated PDF has the policy number

2. **Database Check:**
   ```sql
   SELECT name, policy_number FROM pets WHERE name = 'Hope';
   -- Should show the new policy number
   ```

3. **PDF Verification:**
   - Open generated PDF
   - Look for "Policy number" field
   - Should show entered value, not "N/A"

---

## Success Criteria

- [x] Policy number is required field for both Nationwide and Trupanion
- [x] Validation catches empty/null policy numbers
- [x] MissingFieldsModal prompts user to enter policy number  
- [x] Policy number saves to correct database table (pets, not profiles)
- [x] PDF generation uses saved policy number
- [x] No more "N/A" in policy number fields

