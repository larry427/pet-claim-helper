# Multi-Pet Bill Modal Investigation

## Summary
**The multi-pet bill modal is DEAD CODE - it never triggers in production.**

---

## The Code

### Frontend Modal (App.tsx:1986-2112)

**Modal appears when:** `multiExtracted` state is not null (line 1986)
```tsx
{authView === 'app' && multiExtracted && (
  <section className="mx-auto mt-8 max-w-3xl">
    <h2>Multiple Pets Detected</h2>
    <p>We found charges for multiple pets on this bill:</p>
    <ul>
      {multiExtracted.pets.map((pg, idx) => (
        <li>{pg.petName} ({pg.petSpecies}) — {computeSubtotal(pg.lineItems)}</li>
      ))}
    </ul>
    {/* Pet matching dropdowns */}
    {/* Generate Bills button */}
  </section>
)}
```

### What It's Supposed to Do

When a user uploads a vet bill with multiple pets (e.g., "Fluffy and Spot both got checkups"), the modal should:
1. Show a list of detected pets with their subtotals
2. Let the user match each extracted pet to their saved pet profiles
3. Generate separate claim PDFs for each pet
4. Save each claim to the database separately

---

## Why It Never Triggers

### 1. Server Extraction (server/index.js:83-100)

The OpenAI extraction prompt asks for **SINGLE PET** data:

```javascript
const prompt = `Extract ALL fields from this veterinary invoice and return as JSON:
{
  "clinic_name": "full clinic name",
  "pet_name": "pet's name",          // ❌ SINGULAR
  "total_amount": numeric value,      // ❌ SINGLE AMOUNT
  "line_items": [...]                 // ❌ SINGLE ARRAY
}`
```

**Server returns:** A flat JSON object for ONE pet only

### 2. Client Normalization (App.tsx:779-801)

The client tries to parse multi-pet data:

```typescript
const normalizeMultiExtracted = (raw: any): MultiPetExtracted | null => {
  if (!raw || !Array.isArray(raw.pets)) return null  // ❌ ALWAYS RETURNS NULL
  // ... rest of code never runs
}
```

**Problem:** Server never returns `raw.pets` array, so this always returns `null`

### 3. Extraction Flow (App.tsx:990-1000)

```typescript
// Try multi-pet first
const maybeMulti = normalizeMultiExtracted(parsed)
if (maybeMulti && maybeMulti.pets.length > 1) {  // ❌ NEVER TRUE
  setMultiExtracted(maybeMulti)
  return
}

// Fallback to single pet
const normalized = normalizeExtracted(parsed)  // ✅ ALWAYS RUNS
setExtracted(normalized)
setMultiExtracted(null)
```

**Result:** `maybeMulti` is always `null`, so the single-pet flow always runs

---

## Root Cause

The server and client are **out of sync:**

| Component | Expected Data Structure | Status |
|-----------|------------------------|--------|
| **Server** | Returns single pet JSON | ✅ Works |
| **Client normalization** | Expects `{ pets: [...] }` array | ❌ Never receives it |
| **Modal UI** | Expects `multiExtracted.pets` array | ❌ Never triggers |

---

## Evidence

### Server Response (actual):
```json
{
  "clinic_name": "Happy Paws Vet",
  "pet_name": "Fluffy",
  "total_amount": 278.05,
  "line_items": [...]
}
```

### Client Expects (for multi-pet):
```json
{
  "clinicName": "Happy Paws Vet",
  "pets": [
    {
      "petName": "Fluffy",
      "petSpecies": "cat",
      "lineItems": [...],
      "subtotal": "278.05"
    },
    {
      "petName": "Spot",
      "petSpecies": "dog",
      "lineItems": [...],
      "subtotal": "156.50"
    }
  ]
}
```

**Mismatch:** Server never returns `pets` array

---

## History

This was likely either:
1. **Planned feature never completed** - UI built, server extraction never updated
2. **Legacy code** - Server was refactored but client code wasn't cleaned up
3. **Partial implementation** - Started but abandoned mid-development

---

## Impact of Recent Dollar Sign Fix

**Good news:** The fix we just applied (line 1993) is harmless even though the code never runs:

```tsx
// Before
<li>{pg.petName} — {pg.subtotal || computeSubtotal(pg.lineItems)}</li>

// After
<li>{pg.petName} — {computeSubtotal(pg.lineItems)}</li>
```

Since `multiExtracted` is always `null`, this line never executes. The fix is ready if/when multi-pet extraction is ever implemented.

---

## Current User Experience

When a user uploads a bill with multiple pets:
1. OpenAI extracts only the **first pet** it finds
2. The bill is saved as a **single claim** (not split)
3. User sees the normal single-pet bill form
4. **No multi-pet modal ever appears**

If the user wants separate claims for each pet, they must:
- Manually edit the line items to remove the other pet's charges
- Upload the bill again and manually select the other pet
- Edit those line items too

---

## Recommendations

### Option 1: Remove Dead Code (Clean Up)
- Delete the multi-pet modal UI (lines 1986-2112)
- Delete `normalizeMultiExtracted()` function
- Delete `MultiPetExtracted` and `ExtractedPetGroup` types
- Simplify the extraction flow

**Pros:** Cleaner codebase, less confusion
**Cons:** Removes potential future feature

### Option 2: Implement Multi-Pet Extraction
- Update server prompt to detect multiple pets
- Return `{ pets: [...] }` array structure
- Test with real multi-pet invoices
- Verify modal flow works end-to-end

**Pros:** Useful feature for users
**Cons:** Requires AI prompt tuning, testing, and validation

### Option 3: Leave It (Current State)
- Keep the code "just in case"
- Document that it's not functional
- No immediate changes needed

**Pros:** No effort required
**Cons:** Dead code clutters codebase, confuses developers

---

## Conclusion

The multi-pet bill modal at line 1993 **never appears** because:
- ✅ The UI code exists and is complete
- ❌ The server extraction doesn't support multi-pet detection
- ❌ The client normalization never finds the expected data structure
- ❌ Therefore `multiExtracted` is always `null`

The recent dollar sign fix is harmless but unnecessary since this code path never executes.
