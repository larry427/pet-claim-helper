# Insurance Premium Total Mismatch - Bug Fix

## 🐛 Critical Bug Identified

**Issue**: Insurance Premiums total didn't match the sum of per-pet breakdown.

**Symptom**:
```
Insurance Premiums (Monthly insurance cost)          $823.00
  • Hemingway: $0 (coverage started Nov 2025)
  • Bo: $0 (coverage started Apr 2025)
  • Angel: $0 (coverage started Oct 2025)
  • Hope: $0 (coverage started Apr 2025)
```

**Expected**: $0 + $0 + $0 + $0 = $0
**Actual**: $823.00

## 🔍 Root Cause

The Insurance Premiums total (`overall.premiumsYTD`) was calculated using `monthsYTD()` which:
- Always calculated months for the **CURRENT YEAR** only
- Ignored the selected year filter (2024, 2025, All Time)

Meanwhile, the per-pet breakdown used `calculatePremiumsForPet(pet, viewYear)` which:
- Respected the year filter
- Correctly showed $0 for 2024 when coverage started in 2025

**Code Before (Line 208)**:
```typescript
const premiumsYTD = pets.reduce((sum, p) =>
  sum + ((Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null)), 0)
```

This used `monthsYTD()` which only looked at current year.

## ✅ Fix Applied

**File**: `src/components/FinancialSummary.tsx`

### Change 1: Overall Premium Total (Lines 207-212)

**Before**:
```typescript
// Premiums paid YTD (current year) from pets
const premiumsYTD = pets.reduce((sum, p) =>
  sum + ((Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null)), 0)
```

**After**:
```typescript
// CRITICAL FIX: Calculate premiums using the SAME function as the breakdown
// This ensures the total always matches the sum of individual pet premiums shown below
const premiumsYTD = pets.reduce((sum, p) => {
  const calc = calculatePremiumsForPet(p, viewYear)
  return sum + calc.total
}, 0)
```

### Change 2: Per-Pet Breakdown Premium (Lines 272-283)

**Before**:
```typescript
// Prime with premiums per pet
for (const p of pets) {
  byPet[p.id] = {
    claimed: 0,
    reimbursed: 0,
    premiums: (Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null),
    nonInsured: 0,
    pendingBills: 0,
    filedClaims: 0,
  }
}
```

**After**:
```typescript
// Prime with premiums per pet - use same calculation as breakdown for consistency
for (const p of pets) {
  const calc = calculatePremiumsForPet(p, viewYear)
  byPet[p.id] = {
    claimed: 0,
    reimbursed: 0,
    premiums: calc.total,
    nonInsured: 0,
    pendingBills: 0,
    filedClaims: 0,
  }
}
```

## 🎯 Impact

Now **all three** calculations use the exact same `calculatePremiumsForPet()` function:

1. ✅ **Insurance Premiums Total** (line in OUT-OF-POCKET BREAKDOWN)
2. ✅ **Per-Pet Breakdown** (bullet points under Insurance Premiums)
3. ✅ **Per-Pet Cards** (individual pet cards at bottom of page)

This **guarantees** the total will always equal the sum of the parts.

## ✅ Verification

Test these scenarios to verify the fix:

### Scenario 1: Filter = 2024 (Coverage started in 2025)

**Setup**:
- All pets have coverage_start_date in 2025 (e.g., "2025-10-01")
- Filter: 2024

**Expected**:
```
Insurance Premiums (Monthly insurance cost)          $0.00
  • Hemingway: $0 (coverage started Nov 2025)
  • Bo: $0 (coverage started Apr 2025)
  • Angel: $0 (coverage started Oct 2025)
  • Hope: $0 (coverage started Apr 2025)
```

**Math**: 0 + 0 + 0 + 0 = $0 ✅

### Scenario 2: Filter = 2025 (Current year, mid-coverage)

**Setup**:
- Angel: $45/mo, started Oct 2025
- Hope: $45/mo, started Apr 2025
- Current date: Nov 16, 2025
- Filter: 2025

**Expected**:
```
Insurance Premiums (Monthly insurance cost)          $450.00
  • Angel: $45/mo × 2 = $90 (Oct - Nov 2025)
  • Hope: $45/mo × 8 = $360 (Apr - Nov 2025)
```

**Math**: 90 + 360 = $450 ✅

### Scenario 3: Filter = All Time

**Setup**:
- Angel: $45/mo, started Oct 2025 (2 months)
- Hope: $45/mo, started Jan 2024 (23 months)
- Filter: All Time

**Expected**:
```
Insurance Premiums (Monthly insurance cost)          $1,125.00
  • Angel: $45/mo × 2 = $90 (since Oct 2025)
  • Hope: $45/mo × 23 = $1,035 (since Jan 2024)
```

**Math**: 90 + 1,035 = $1,125 ✅

## 🔧 Technical Details

### Why Use the Same Function?

**Single Source of Truth**:
```typescript
const calculatePremiumsForPet = (pet: PetRow, filterYear: number | null) => {
  // Handles ALL edge cases:
  // - No insurance
  // - Coverage started after filter year
  // - Coverage started mid-year
  // - Future years
  // - Partial current year
  // - All time

  return { total, monthsCount, context }
}
```

By using this **one function** everywhere, we ensure:
- ✅ Consistent calculations
- ✅ No mismatch bugs
- ✅ Easier to maintain
- ✅ Edge cases handled uniformly

### Old Function (monthsYTD) Problems:

```typescript
const monthsYTD = (startIso: string | null | undefined): number => {
  if (!startIso) return 0
  const start = parseYmdLocal(startIso)
  if (isNaN(start.getTime())) return 0
  const now = new Date()
  const currentYear = now.getFullYear()  // ← ALWAYS current year
  const startYear = (start as Date).getFullYear()
  if (startYear > currentYear) return 0
  const startMonthForYear = startYear < currentYear ? 0 : (start as Date).getMonth()
  const endMonth = now.getMonth()
  const months = (endMonth - startMonthForYear + 1)
  return Math.max(0, months)
}
```

**Problems**:
- ❌ Hardcoded to `currentYear` - ignores filter
- ❌ Doesn't understand "All Time" vs specific year
- ❌ Can't show $0 for 2024 when coverage started 2025

## 📊 Comparison Matrix

| Scenario | Old Behavior | New Behavior |
|----------|-------------|--------------|
| **Filter: 2024, Coverage: 2025** | Shows current year premium ($823) | Shows $0 (correct) |
| **Filter: 2025, Coverage: 2024** | Shows current year premium | Shows partial year premium (correct) |
| **Filter: All Time** | Shows current year premium | Shows total since coverage start (correct) |
| **Total vs Breakdown** | ❌ Mismatch | ✅ Always matches |

## 🎉 Result

Users can now:
- ✅ Trust the numbers (they add up correctly)
- ✅ Filter by any year and see accurate totals
- ✅ Verify calculations themselves
- ✅ Understand their true insurance costs

The fix provides **brutal financial honesty** - all numbers are transparent and verifiable.

## 📝 Files Changed

- ✅ `src/components/FinancialSummary.tsx` (2 locations updated)

## 🚀 Deployment Notes

- No database changes required
- No environment variables needed
- Fix is purely client-side calculation logic
- Backwards compatible (no breaking changes)
- Safe to deploy immediately

## 🧪 Post-Deployment Testing

1. Navigate to Financial Summary
2. Change year filter to 2024, 2025, All Time
3. Verify Insurance Premiums total matches sum of breakdown
4. Check browser console for errors (should be none)
5. Test with different pet combinations (no insurance, mid-year start, etc.)

All tests should show: **Total = Sum of breakdown** ✅
