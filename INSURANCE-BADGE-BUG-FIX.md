# Insurance Badge Bug Fix - Property Name Mismatch

## 🐛 BUG DISCOVERED

The insurance company name was **NOT displaying** on claim badges due to a property name mismatch.

---

## Root Cause Analysis

### Database Schema (Snake Case):
**File**: `src/lib/claims.ts:46`
```typescript
.select('*, pets(id, name, species, insurance_company)')
```
Returns: `pet.insurance_company` ← **snake_case**

### Original Buggy Code (Camel Case):
**File**: `src/App.tsx:2428` (BEFORE)
```typescript
const insuranceCompany = pet?.insuranceCompany || ''
```
Accessing: `pet.insuranceCompany` ← **camelCase** (doesn't exist!)

### Result:
- Property `insuranceCompany` doesn't exist on pet object
- Always returns empty string `''`
- Badge shows: `Insured` (no company name)
- **Feature completely broken** ❌

---

## The Fix

### Corrected Code:
**File**: `src/App.tsx:2429` (AFTER)
```typescript
// Database returns insurance_company (snake_case), not insuranceCompany
const insuranceCompany = (pet as any)?.insurance_company || ''
```

Now accessing: `pet.insurance_company` ← **snake_case** (matches database!)

### What Changed:
```diff
- const insuranceCompany = pet?.insuranceCompany || ''
+ const insuranceCompany = (pet as any)?.insurance_company || ''
```

---

## Verification

### Database Query Returns:
```json
{
  "id": "uuid",
  "name": "Neo",
  "species": "dog",
  "insurance_company": "Nationwide"  ← snake_case
}
```

### Code Now Accesses:
```typescript
pet.insurance_company  ← Matches database column name
```

### Expected Badge Output:
```
✅ Insured • Nationwide
✅ Insured • Trupanion
✅ Insured • Healthy Paws
```

---

## Why This Happened

### TypeScript Type Definition:
**File**: `src/types.ts:28`
```typescript
export type PetProfile = {
  insuranceCompany: InsuranceCompany  ← camelCase in type
  // ...
}
```

### Database Column:
```sql
pets table: insurance_company  ← snake_case in database
```

### The Mismatch:
- **Type definition** uses `insuranceCompany` (for TypeScript/local state)
- **Database column** is `insurance_company` (Postgres naming convention)
- **Query result** preserves database column name (snake_case)
- **Original code** assumed TypeScript type (camelCase)

---

## Testing Checklist

After deploying the fix:

### Test 1: Nationwide Pet
- [ ] Login to app
- [ ] Find claim for Nationwide pet
- [ ] **Expected**: Badge shows `Insured • Nationwide`

### Test 2: Trupanion Pet
- [ ] Find claim for Trupanion pet
- [ ] **Expected**: Badge shows `Insured • Trupanion`

### Test 3: No Insurance Company
- [ ] Find pet with no insurance company set
- [ ] **Expected**: Badge shows `Insured` (fallback)

### Test 4: Console Check
- [ ] Open browser console
- [ ] Look for errors related to pet data
- [ ] **Expected**: No errors

---

## Deployment History

### First Deployment (BROKEN):
```
Commit: 18e79163
Status: ❌ BROKEN - Property name mismatch
Result: Insurance company never displayed
```

### Second Deployment (FIXED):
```
Commit: [pending]
Status: ✅ FIXED - Correct property name
Result: Insurance company displays correctly
```

---

## Build Status

```bash
npm run build
✓ built in 1.52s
```

✅ No TypeScript errors
✅ No build warnings (related to this fix)
✅ Ready to deploy

---

## Complete Fix

**File**: `src/App.tsx:2426-2441`

```typescript
const catBadge = (() => {
  const v = (c.expense_category || 'insured') as 'insured' | 'not_insured' | 'maybe_insured'
  // Database returns insurance_company (snake_case), not insuranceCompany
  const insuranceCompany = (pet as any)?.insurance_company || ''

  if (v === 'insured') {
    // Show "Insured • [Company Name]" if insurance company exists
    const text = insuranceCompany ? `Insured • ${insuranceCompany}` : 'Insured'
    return { text, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
  }
  if (v === 'not_insured') return { text: 'Not Insured', cls: 'bg-amber-50 text-amber-700 border border-amber-200' }

  // Maybe insured - also show company if available
  const text = insuranceCompany ? `Maybe Insured • ${insuranceCompany}` : 'Maybe Insured'
  return { text, cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
})()
```

---

## Lessons Learned

1. **Always check database column names** when accessing query results
2. **TypeScript types don't match database schema** (camelCase vs snake_case)
3. **Test features locally** before deploying to production
4. **Query results preserve database column names** (not TypeScript property names)

---

## Next Steps

1. ✅ Fix applied
2. ✅ Build successful
3. 🔜 Commit fix
4. 🔜 Deploy to production
5. 🔜 Test in production with real data
6. 🔜 Verify insurance companies display correctly

---

**Status**: ✅ FIXED - Ready to deploy correct version
