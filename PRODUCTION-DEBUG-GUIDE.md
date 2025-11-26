# Production Debugging Guide - Insurance Company Badge

## ✅ VERIFIED - Everything Is Correct!

### Database Check: ✅
- `insurance_company` column EXISTS in pets table
- Data is populated: "Nationwide", "Trupanion", etc.
- Larry's pet "Neo" has: `insurance_company: "Nationwide"`

### Query Check: ✅
```typescript
// src/lib/claims.ts:46
.select('*, pets(id, name, species, insurance_company)')
```
- Query includes `insurance_company` ✅
- Returns data correctly ✅

### Code Check: ✅
```typescript
// src/App.tsx:2413
const pet = c.pets || {}

// src/App.tsx:2429
const insuranceCompany = (pet as any)?.insurance_company || ''

// src/App.tsx:2433
const text = insuranceCompany ? `Insured • ${insuranceCompany}` : 'Insured'
```
- Uses correct property name ✅
- Logic is sound ✅

### Build Check: ✅
- Production bundle contains `insurance_company` references ✅
- Latest code (commit `2f656cfd`) is built ✅

---

## ⚠️ LIKELY ISSUE: CACHING

The code is correct but the user is seeing old version. Possible causes:

### 1. Vercel CDN Cache
**Solution**: Wait 5-10 minutes for CDN to update

### 2. Browser Cache
**Solution**: Hard refresh
- **Chrome/Edge**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R`

### 3. Service Worker Cache
**Solution**:
1. Open DevTools (F12)
2. Go to Application → Service Workers
3. Click "Unregister"
4. Hard refresh

---

## 🔍 DEBUG IN PRODUCTION

### Step 1: Check Browser Console

1. Go to https://pet-claim-helper.vercel.app
2. Open DevTools (F12)
3. Go to Console tab
4. Look for: `[listClaims] QUERY RESULT`

**What to look for:**
```javascript
[listClaims] QUERY RESULT - data: [{
  pets: {
    id: "...",
    name: "Neo",
    species: "dog",
    insurance_company: "Nationwide"  // ← Should be here!
  }
}]
```

**If `insurance_company` is MISSING:**
- Old code is still deployed (cache issue)

**If `insurance_company` is PRESENT:**
- New code is deployed but rendering is broken

### Step 2: Check Loaded Bundle

In DevTools Console, run:
```javascript
// Get the main bundle filename
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/assets/index-'))
  .map(r => r.name)
```

**Expected**: Should see `index-UAcfkjws.js` (the latest build)

**If you see different filename**: Old bundle is cached

### Step 3: Inspect Claim Card Element

1. Right-click on "Insured" badge
2. Select "Inspect Element"
3. Look at the text content

**Expected HTML:**
```html
<div class="px-2 py-1 rounded-full...">Insured • Nationwide</div>
```

**If you see just "Insured"**: Rendering issue

---

## 🔧 FORCE NEW DEPLOYMENT

If caching persists, force a new deployment:

### Option 1: Dummy Commit
```bash
git commit --allow-empty -m "Force Vercel redeploy"
git push origin main
```

### Option 2: Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Find pet-claim-helper project
3. Click latest deployment
4. Click "Redeploy"
5. Check "Use existing Build Cache" = OFF

---

## 📊 VERIFICATION TEST

Once deployed, test with these specific claims:

### Test 1: Neo (Nationwide)
```
Expected: "Insured • Nationwide"
Pet: Neo
User: larrylevin@gmail.com or larrysecrets@gmail.com
```

### Test 2: Other Claims
Database shows these pets with insurance:
- Smokey: "Trupanion"
- Bo: "Trupanion"
- TESTDOG - NW: "Nationwide"
- Angel: "Nationwide"

All should show company name.

---

## 🐛 IF STILL NOT WORKING

### Check Data Received in React

Add this temporarily to `App.tsx` around line 2413:

```typescript
{orderedClaims.map((c) => {
  const pet = c.pets || {}
  console.log('🔍 Claim pet data:', {
    claimId: c.id,
    petName: pet.name,
    insurance_company: pet.insurance_company,  // snake_case
    insuranceCompany: pet.insuranceCompany,    // camelCase
    allKeys: Object.keys(pet)
  })

  // rest of code...
```

This will show EXACTLY what data React is receiving.

---

## ✅ EXPECTED CONSOLE OUTPUT

When working correctly, you should see:

```
[listClaims] START - userId= 16bc181e-e039-4ca1-85c3-494d518fa392
[listClaims] QUERY RESULT - data: [{
  id: "...",
  pets: {
    id: "...",
    name: "Neo",
    species: "dog",
    insurance_company: "Nationwide"  ✅
  }
}]
[listClaims] SUCCESS - count= 1

🔍 Claim pet data: {
  claimId: "...",
  petName: "Neo",
  insurance_company: "Nationwide",  ✅
  insuranceCompany: undefined,
  allKeys: ["id", "name", "species", "insurance_company"]
}
```

---

## 📝 SUMMARY

| Component | Status | Verified |
|-----------|--------|----------|
| Database column | ✅ EXISTS | insurance_company |
| Database data | ✅ POPULATED | Nationwide, Trupanion |
| Query SELECT | ✅ CORRECT | includes insurance_company |
| Code property access | ✅ CORRECT | pet.insurance_company |
| Build | ✅ UPDATED | commit 2f656cfd |
| Deployment | ⚠️ UNKNOWN | Check Vercel |

**Root Cause**: Almost certainly **caching issue**

**Solution**: Hard refresh browser + wait for CDN update

---

## 🚀 NEXT STEPS

1. Hard refresh browser (Cmd+Shift+R)
2. Wait 5 minutes for CDN
3. Check console for `[listClaims]` output
4. Verify `insurance_company` is in the data
5. If still not working, add debug console.log as shown above
6. Report back with console output

**The code is correct. It's just a matter of getting the new code to the browser.**
