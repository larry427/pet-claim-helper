# Insurance Integration Skill

## Name
Pet Insurance Integration

## Description
Use this skill when adding a new pet insurance company to Pet Claim Helper, debugging insurance form issues, or modifying existing insurance integrations. This skill contains the complete 9-step checklist and lessons learned from previous integrations.

---

## 9-Step Integration Checklist

**CRITICAL: Complete ALL 9 steps. Missing any step will cause the integration to fail silently or fall back to generic forms.**

### Step 1: PDF Form in Server
- [ ] Place PDF in `server/claim-forms/{insurer}_claim_form.pdf`
- [ ] Verify file exists and is readable
- [ ] Inspect PDF fields with:
```javascript
cd server && node -e "
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
async function inspect() {
  const pdfBytes = fs.readFileSync('claim-forms/{insurer}_claim_form.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateFieldAppearances: false });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  console.log('Total fields:', fields.length);
  fields.forEach((f, i) => {
    console.log((i+1) + '. ' + f.getName() + ' (' + f.constructor.name + ')');
  });
}
inspect();
"
```

### Step 2: FORM_FIELD_MAPPINGS
- [ ] Add mapping in `server/lib/claimFormMappings.js` in the `FORM_FIELD_MAPPINGS` object
- [ ] Map each PDF field name to the corresponding claimData property
- [ ] **WARNING**: PDFfiller auto-generated names (Text_1, Number_1) may not match visual order - verify by testing!

### Step 3: getMappingForInsurer()
- [ ] Add check in `getMappingForInsurer()` function (~line 367):
```javascript
} else if (normalized.includes('{insurer}')) {
  return FORM_FIELD_MAPPINGS['{insurer}']
}
```

### Step 4: shouldUseOfficialForm() — CRITICAL!
- [ ] Add check in `shouldUseOfficialForm()` function (~line 91-100):
```javascript
if (normalizedInsurer.includes('{insurer}')) return true
```
- **THIS IS THE MOST COMMONLY MISSED STEP** - without it, system falls back to generic form

### Step 5: PDF Path Selection
- [ ] Add PDF path in `generateClaimPDF.js` (~line 140):
```javascript
} else if (normalizedInsurer.includes('{insurer}')) {
  pdfPath = path.join(__dirname, '../claim-forms/{insurer}_claim_form.pdf')
}
```

### Step 6: getValueForField()
- [ ] Most insurers use common fields (policyholderName, address, etc.)
- [ ] Only add insurer-specific section if truly unique fields needed
- [ ] **DO NOT** use conditional spreads with outer-scope variables - they break!
```javascript
// WRONG - normalizedInsurer not in scope:
...(normalizedInsurer.includes('aspca') && { /* fields */ })

// RIGHT - define fields unconditionally, mappings control what's used
```

### Step 7: Frontend Insurance Options
- [ ] Add to dropdown in `src/lib/insuranceOptions.ts` (~line 30)
- [ ] Add to auto-submit check (~line 109)

### Step 8: PRODUCTION_INSURERS Arrays
- [ ] Add to `PRODUCTION_INSURERS` in `src/App.tsx` (~line 39)
- [ ] Add to `PRODUCTION_INSURERS` in `server/lib/generateClaimPDF.js` (~line 25)

### Step 9: Claims Email
- [ ] Add email in `getInsurerEmail()` function in `server/lib/generateClaimPDF.js` (~line 1464)

---

## MFM (Missing Fields Modal) Requirements

### Adding Insurer-Specific Required Fields

Add to `INSURER_REQUIRED_FIELDS` in `server/lib/claimFormMappings.js`:

```javascript
'{insurer}': [
  // Standard fields (copy from existing insurer like Spot)
  { field: 'signature', source: 'profiles.signature', required: true, type: 'signature' },
  { field: 'policyholderName', source: 'profiles.full_name', ... },
  // etc.

  // Insurer-specific fields
  {
    field: 'breed',
    source: 'pets.breed',
    required: true,
    type: 'text',
    prompt: "Pet's breed",
    placeholder: 'e.g., Golden Retriever',
    saveToDb: true
  },
]
```

### Supported MFM Field Types

**MissingFieldsModal.tsx ONLY renders these types:**
- ✅ `signature`
- ✅ `text`
- ✅ `textarea`
- ✅ `date`
- ✅ `phone`
- ✅ `radio` (with `options: ['Option1', 'Option2']`)

**NOT SUPPORTED (returns null, causes validation failure):**
- ❌ `select` — use `radio` instead for dropdowns
- ❌ `currency` — don't include fields that come from vet bill extraction

### Common MFM Patterns

**Age field (ask every time, don't save):**
```javascript
{
  field: 'age',
  source: 'claim.age',
  required: true,
  type: 'text',
  prompt: "How old is your pet?",
  placeholder: "e.g., 4",
  description: 'Enter age as a whole number',
  saveToDb: false
}
```

**Gender field (radio buttons, save to DB):**
```javascript
{
  field: 'gender',
  source: 'pets.gender',
  required: true,
  type: 'radio',  // NOT 'select'!
  prompt: "Pet's gender",
  options: ['Male', 'Female'],
  saveToDb: true
}
```

### Don't Include in MFM
- `diagnosis` — hardcoded to "See attached invoice"
- `totalAmount` — extracted from vet bill
- Any field already populated from profile/pet data

### Update getRequiredFieldsForInsurer()

Add check (~line 1166):
```javascript
} else if (normalized.includes('{insurer}')) {
  return INSURER_REQUIRED_FIELDS['{insurer}']
}
```

---

## PDF Field Verification Process

**ALWAYS verify the full pipeline before claiming a fix is complete:**

1. **UI** → Does the frontend send correct data?
2. **API** → Does the endpoint receive it?
3. **DB Save** → Is it stored correctly in Supabase?
4. **DB Query** → Is it retrieved correctly?
5. **claimData** → Is the value present in the claimData object?
6. **PDF Output** → Does it appear correctly in the generated PDF?

### Debug Logging Pattern

Add temporary logging in `generateClaimPDF.js`:
```javascript
if (normalizedInsurer.includes('{insurer}')) {
  console.log(`\n${'🐾'.repeat(40)}`)
  console.log(`🐾 {INSURER} PDF GENERATION - CLAIMDATA:`)
  console.log(`  fieldName: "${claimData.fieldName}"`)
  // ... all relevant fields
  console.log(`${'🐾'.repeat(40)}\n`)
}
```

---

## Common Gotchas & Lessons Learned

### 1. Field Names Don't Match Visual Order
PDFfiller generates names like Text_1, Text_2 based on creation order, not visual position. Always test with real data to verify mapping.

### 2. Signature Widget Fields
Forms from PDFfiller use `PDFSignature` type. These require coordinate extraction from widget annotations. The existing handler supports this automatically.

### 3. Email Field Font Size
Long emails may not fit. Add special handling:
```javascript
if (pdfFieldName === 'Email_1') {
  textField.setFontSize(8)
}
```

### 4. Currency Prefix
Add $ prefix for amount fields:
```javascript
if (pdfFieldName === 'USD_1' && !finalValue.startsWith('$')) {
  finalValue = '$' + finalValue
}
```

### 5. cityStateZip Combination
Many forms have a single field for city/state/zip:
```javascript
cityStateZip: `${claimData.city || ''}, ${claimData.state || ''} ${claimData.zip || ''}`.trim()
```

### 6. Demo vs Production Accounts
- DEMO_ACCOUNTS: Emails that route to test email (larry@uglydogadventures.com)
- PRODUCTION_INSURERS: Insurers that can send to real claims addresses
- Update `ClaimSubmissionModal.tsx` if adding demo accounts

---

## Current Production Insurers (as of Dec 2025)

1. Pumpkin
2. Spot
3. Healthy Paws
4. Nationwide
5. Trupanion
6. Pets Best
7. Figo
8. ASPCA

---

## Testing New Integration

1. Use a DEMO_ACCOUNT email (larrysecrets@gmail.com)
2. Create a pet with the new insurer
3. Upload a vet bill
4. Click Auto-Submit
5. Verify MFM asks for required fields
6. Check generated PDF has all fields filled correctly
7. Verify email received at test address
