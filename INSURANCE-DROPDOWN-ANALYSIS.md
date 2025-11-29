# Insurance Dropdown Analysis - Before Making Changes

## Database Values Currently Stored

```
UNIQUE INSURANCE_COMPANY VALUES IN DATABASE:
"" (empty string) - Pets: Chris, Angel
"Healthy Paws" - Pets: Buddy, Bo, Bo, Hope, Neo, Trinity
"Nationwide" - Pets: Jaeger
"Other" - Pets: Arya, Hemingway
"Trupanion" - Pets: Trinity
```

**Key Finding:** Database stores JUST the company name (e.g., "Healthy Paws", "Trupanion", "Nationwide"), NOT with deadline labels.

## Auto-Submit Matching Logic

### How Auto-Submit Matches Insurance Companies

**From server/index.js (lines 1483-1491):**
```javascript
const rawInsurer = claim.pets?.insurance_company
const insurer = rawInsurer?.toLowerCase()
```

**From server/lib/claimFormMappings.js (lines 226-231):**
```javascript
const normalized = insurerName.toLowerCase()

if (normalized.includes('nationwide')) {
  return FORM_FIELD_MAPPINGS.nationwide
} else if (normalized.includes('healthy') || normalized.includes('paws')) {
  return FORM_FIELD_MAPPINGS.healthypaws
} else if (normalized.includes('trupanion')) {
  return FORM_FIELD_MAPPINGS.trupanion
}
```

**Key Finding:** Auto-Submit uses `.toLowerCase()` and `.includes()` matching:
- "Healthy Paws" matches because it includes "healthy" or "paws"
- "Trupanion" matches because it includes "trupanion"
- "Nationwide" matches because it includes "nationwide"

### Supported Insurance Companies for Auto-Submit

From the code analysis:
1. **Nationwide** - Uses official PDF form with fillable fields
2. **Trupanion** - Uses official PDF form with fillable fields
3. **Healthy Paws** - Uses official PDF form with text overlay

## Safety Analysis for Proposed Changes

### Proposed Dropdown Values:
```
1. — Select —
2. Not Insured
3. Trupanion (90 days)
4. Nationwide (365 days)
5. Healthy Paws (90 days)
6. Custom Insurance
```

### CRITICAL: What Gets Saved to Database?

We need to save ONLY the company name, stripping the deadline label:
- Display: "Trupanion (90 days)" → Save: "Trupanion"
- Display: "Nationwide (365 days)" → Save: "Nationwide"
- Display: "Healthy Paws (90 days)" → Save: "Healthy Paws"
- Display: "Not Insured" → Save: "" (empty string)
- Display: "Custom Insurance" → Save: "Other"

### Auto-Submit Compatibility ✅

**SAFE:** The proposed changes are compatible with Auto-Submit IF we save only the company name:

- "Trupanion" → matches `includes('trupanion')` ✅
- "Nationwide" → matches `includes('nationwide')` ✅
- "Healthy Paws" → matches `includes('healthy')` or `includes('paws')` ✅
- "Other" → No match, will not auto-submit (expected behavior) ✅
- "" → No match, will not auto-submit (expected behavior) ✅

### Companies to REMOVE from Dropdown

These are currently NOT supported by Auto-Submit:
- Fetch
- Pets Best
- ASPCA
- Embrace
- Figo

**SAFE to remove:** None of these have Auto-Submit implementations, so removing them won't break any functionality.

## Implementation Plan

### 1. Value Mapping Function

Create a helper function to strip deadline labels:

```typescript
function getInsuranceValueForDB(displayValue: string): string {
  if (displayValue === '— Select —') return ''
  if (displayValue === 'Not Insured') return ''
  if (displayValue === 'Custom Insurance') return 'Other'

  // Strip deadline labels: "Trupanion (90 days)" → "Trupanion"
  return displayValue.replace(/\s*\(\d+\s*days?\).*$/i, '').trim()
}
```

### 2. Display Mapping Function

Create a helper to show saved value with deadline label in dropdown:

```typescript
function getInsuranceDisplayValue(dbValue: string): string {
  if (!dbValue || dbValue === '') return 'Not Insured'
  if (dbValue === 'Other') return 'Custom Insurance'
  if (dbValue === 'Trupanion') return 'Trupanion (90 days)'
  if (dbValue === 'Nationwide') return 'Nationwide (365 days)'
  if (dbValue === 'Healthy Paws') return 'Healthy Paws (90 days)'
  return dbValue // Fallback for legacy values
}
```

### 3. Files to Update

**src/App.tsx** - Edit Pet Modal
**src/components/OnboardingModal.tsx** - Onboarding Flow

## Conclusion

✅ **SAFE TO PROCEED** - The proposed dropdown changes will NOT break Auto-Submit functionality as long as:

1. We save ONLY the company name (without deadline labels) to the database
2. We implement proper value mapping functions
3. We test both modals to ensure they save the correct values

The Auto-Submit code uses flexible `.includes()` matching which will work with the clean company names we save.
