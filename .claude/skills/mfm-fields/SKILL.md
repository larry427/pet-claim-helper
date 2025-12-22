# Missing Fields Modal (MFM) Skill

## Name
MFM Field Management

## Description
Use this skill when adding fields to the Missing Fields Modal, debugging why fields aren't showing, or fixing validation issues. The MFM prompts users for insurer-required information before claim submission.

---

## How MFM Works

1. User clicks "Auto-Submit" on a vet bill
2. Frontend calls `/api/claims/validate-fields` with claim + pet + insurer
3. Backend checks `INSURER_REQUIRED_FIELDS[insurer]` for required fields
4. Backend checks if each field has a value via `getFieldValue()`
5. Missing fields are returned to frontend
6. `MissingFieldsModal.tsx` renders input for each missing field
7. User fills fields → clicks "Continue to Submit"
8. Values saved to DB (if `saveToDb: true`) and passed to PDF generation

---

## Supported Field Types

**MissingFieldsModal.tsx `renderField()` ONLY handles these types:**

| Type | Renders As | Use For |
|------|-----------|---------|
| `signature` | Signature pad | Policy holder signature |
| `text` | Text input | Names, breeds, policy numbers |
| `textarea` | Multi-line input | Descriptions, notes |
| `date` | Date picker | Dates of birth, service dates |
| `phone` | Phone input | Phone numbers with formatting |
| `radio` | Radio buttons | Male/Female, Yes/No choices |

**NOT SUPPORTED — returns `null` and causes validation to fail:**

| Type | Problem | Solution |
|------|---------|----------|
| `select` | Not rendered | Use `radio` instead |
| `currency` | Not rendered | Don't include — comes from vet bill |
| `checkbox` | Not rendered | Use `radio` with Yes/No |

---

## Field Definition Structure

```javascript
{
  field: 'fieldName',           // Key used in formData and claimData
  source: 'table.column',       // Where data comes from/saves to
  required: true,               // Always true for MFM fields
  type: 'text',                 // One of supported types above
  prompt: "User-facing label",  // Shows as field label
  placeholder: 'e.g., Example', // Input placeholder text
  description: 'Helper text',   // Shows below the input (optional)
  options: ['A', 'B'],          // Required for 'radio' type
  saveToDb: true,               // true = save to DB, false = ask every time
  showIf: 'otherField === "Yes"' // Conditional display (optional)
}
```

---

## Common Field Patterns

### Text Input (saved to DB)
```javascript
{
  field: 'breed',
  source: 'pets.breed',
  required: true,
  type: 'text',
  prompt: "Pet's breed",
  placeholder: 'e.g., Golden Retriever',
  saveToDb: true
}
```

### Text Input (ask every time)
```javascript
{
  field: 'age',
  source: 'claim.age',
  required: true,
  type: 'text',
  prompt: "How old is your pet?",
  placeholder: 'e.g., 4',
  description: 'Enter age as a whole number',
  saveToDb: false
}
```

### Radio Buttons
```javascript
{
  field: 'gender',
  source: 'pets.gender',
  required: true,
  type: 'radio',
  prompt: "Pet's gender",
  options: ['Male', 'Female'],
  saveToDb: true
}
```

### Conditional Field
```javascript
{
  field: 'otherInsuranceProvider',
  source: 'claim.other_insurance_provider',
  required: true,
  type: 'text',
  prompt: 'Previous insurance provider',
  showIf: 'hadOtherInsurance === "Yes"',
  saveToDb: false
}
```

---

## Adding Fields for New Insurer

### Step 1: Define Required Fields

In `server/lib/claimFormMappings.js`, add to `INSURER_REQUIRED_FIELDS`:

```javascript
'{insurer}': [
  // Copy standard fields from existing insurer (e.g., Spot)
  { field: 'signature', source: 'profiles.signature', required: true, type: 'signature', prompt: 'Your signature' },
  { field: 'policyholderName', source: 'profiles.full_name', required: true, type: 'text', prompt: 'Full name' },
  // ... other standard fields

  // Add insurer-specific fields
  { field: 'customField', source: 'claim.custom_field', required: true, type: 'text', prompt: 'Custom Question' }
]
```

### Step 2: Update getRequiredFieldsForInsurer()

```javascript
} else if (normalized.includes('{insurer}')) {
  return INSURER_REQUIRED_FIELDS['{insurer}']
}
```

### Step 3: Ensure getFieldValue() Returns the Value

Check that the field is mapped in `getFieldValue()` fieldMap object.

---

## Debugging MFM Issues

### Field Not Showing

1. **Check field type** — Is it a supported type? (`select` won't render)
2. **Check getRequiredFieldsForInsurer()** — Does it return fields for this insurer?
3. **Check getFieldValue()** — Is it returning a value? (If yes, field is "filled" and won't show)
4. **Check database** — Does the column have a value (even empty string)?

### Debug Logging

Add in `server/index.js` validate-fields endpoint:
```javascript
console.log('[MFM Debug] Insurer:', insurer)
console.log('[MFM Debug] Required fields:', requiredFields.map(f => f.field))
console.log('[MFM Debug] Missing fields:', missingFields.map(f => f.field))
```

Add in `MissingFieldsModal.tsx`:
```javascript
console.log('[MFM] formData:', formData)
console.log('[MFM] visibleFields:', visibleFields.map(f => f.field))
```

### Validation Failing (Can't Click Continue)

1. **Check all visible fields have values** in formData
2. **Check for unrendered fields** — type not supported = field exists but returns null
3. **Add logging** to see which field is failing:
```javascript
visibleFields.forEach(field => {
  const value = formData[field.field]
  console.log(`[MFM Validation] ${field.field}: "${value}" - ${value ? 'PASS' : 'FAIL'}`)
})
```

---

## Fields NOT to Include in MFM

| Field | Reason |
|-------|--------|
| `diagnosis` | Hardcoded to "See attached invoice" |
| `totalAmount` | Extracted from vet bill |
| `serviceDate` | Extracted from vet bill |
| `signatureDate` | Auto-generated (today's date) |
| `petName` | Comes from pets table |
| Any field with existing value | getFieldValue() returns it, so it's not "missing" |

---

## Empty String vs NULL

**Important:** The validation check is:
```javascript
if (!value || value === '' || value === null || value === undefined) {
  missing.push(fieldDef)
}
```

This catches:
- `null`
- `undefined`
- Empty string `''`
- Falsy values

So both NULL and empty string in DB will trigger the MFM prompt.
