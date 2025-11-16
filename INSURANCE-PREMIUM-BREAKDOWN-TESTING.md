# Insurance Premium Breakdown - Testing Guide

## ✅ Feature Implemented

Added per-pet insurance premium breakdown in the "YOUR OUT-OF-POCKET BREAKDOWN" section of the Financial Summary.

**Location**: `src/components/FinancialSummary.tsx`

## 📋 What Was Added

### 1. Helper Function: `calculatePremiumsForPet(pet, filterYear)`

Calculates insurance premiums for a specific pet based on the selected year filter.

**Returns**:
```typescript
{
  total: number,        // Total premium amount
  monthsCount: number,  // Number of months of coverage
  context: string       // Human-readable context (e.g., "Oct - Nov 2025")
}
```

**Handles All Edge Cases**:
- ✅ Pets with no insurance → "No insurance"
- ✅ Coverage started after filter year → "$0 (coverage started Oct 2025)"
- ✅ Coverage started mid-year → "$45/mo × 2 = $90 (Oct - Nov 2025)"
- ✅ Future years → "$0 (future year)"
- ✅ Full year coverage → "$45/mo × 12 = $540 (2024)"
- ✅ Current year partial → "$45/mo × 11 = $495 (Jan - Nov 2025)"
- ✅ All Time → "$45/mo × 23 = $1,035 (since Jan 2024)"

### 2. UI Component

Per-pet breakdown appears under the "Insurance Premiums" line:

```
Insurance Premiums (Monthly insurance cost)          $1,125.00
  • Angel: $45/mo × 2 = $90 (Oct - Nov 2025)
  • Hope: $45/mo × 23 = $1,035 (since Jan 2024)
  • Hemingway: No insurance
```

## 🧪 Test Scenarios

### Scenario 1: Angel (Coverage started Oct 1, 2025, $45/mo)

**Setup**:
- monthly_premium: 45
- coverage_start_date: "2025-10-01"
- Current date: Nov 16, 2025

**Expected Results**:

| Filter | Display | Explanation |
|--------|---------|-------------|
| 2024 | `• Angel: $0 (coverage started Oct 2025)` | Coverage didn't exist in 2024 |
| 2025 | `• Angel: $45/mo × 2 = $90 (Oct - Nov 2025)` | 2 months: Oct, Nov |
| All Time | `• Angel: $45/mo × 2 = $90 (since Oct 2025)` | Same as 2025 (recent coverage) |

### Scenario 2: Hope (Coverage started Jan 1, 2024, $45/mo)

**Setup**:
- monthly_premium: 45
- coverage_start_date: "2024-01-01"
- Current date: Nov 16, 2025

**Expected Results**:

| Filter | Display | Explanation |
|--------|---------|-------------|
| 2024 | `• Hope: $45/mo × 12 = $540 (2024)` | Full year 2024 |
| 2025 | `• Hope: $45/mo × 11 = $495 (Jan - Nov 2025)` | 11 months (Jan-Nov) of 2025 |
| All Time | `• Hope: $45/mo × 23 = $1,035 (since Jan 2024)` | 12 (2024) + 11 (2025) = 23 months |

### Scenario 3: Hemingway (No insurance)

**Setup**:
- monthly_premium: 0 or null
- coverage_start_date: null

**Expected Results**:

| Filter | Display | Explanation |
|--------|---------|-------------|
| All filters | `• Hemingway: No insurance` | No insurance coverage |

**Note**: Hemingway should NOT be included in the total premium calculation.

### Scenario 4: All Pets Combined

**Setup**:
- Angel: $45/mo starting Oct 2025
- Hope: $45/mo starting Jan 2024
- Hemingway: No insurance
- Diesel: $45/mo starting Jan 2024

**Expected Results for 2025 Filter**:

```
Insurance Premiums (Monthly insurance cost)          $585.00
  • Angel: $45/mo × 2 = $90 (Oct - Nov 2025)
  • Hope: $45/mo × 11 = $495 (Jan - Nov 2025)
  • Hemingway: No insurance
  • Diesel: $45/mo × 11 = $495 (Jan - Nov 2025)
```

**Verification**: 90 + 495 + 0 + 495 = $1,080 ❌ ERROR if total doesn't match!

### Scenario 5: Coverage Started Mid-Year

**Setup**:
- Pet: Luna
- monthly_premium: 50
- coverage_start_date: "2025-06-15"
- Current date: Nov 16, 2025

**Expected Results**:

| Filter | Display | Explanation |
|--------|---------|-------------|
| 2025 | `• Luna: $50/mo × 6 = $300 (Jun - Nov 2025)` | Jun, Jul, Aug, Sep, Oct, Nov = 6 months |

### Scenario 6: Future Year Filter

**Setup**:
- Pet: Max
- monthly_premium: 40
- coverage_start_date: "2024-01-01"
- Current date: Nov 16, 2025

**Expected Results**:

| Filter | Display | Explanation |
|--------|---------|-------------|
| 2026 | `• Max: $0 (future year)` | 2026 hasn't happened yet |

## ✅ Verification Checklist

Use this checklist to verify the implementation works correctly:

### Basic Functionality
- [ ] Premium breakdown appears under "Insurance Premiums" line
- [ ] Breakdown shows all pets (including those with no insurance)
- [ ] Breakdown updates when changing year filter
- [ ] Format matches: "$45/mo × 12 = $540 (context)"

### Edge Cases
- [ ] Pets with no insurance show "No insurance"
- [ ] Coverage starting after filter year shows "$0 (coverage started...)"
- [ ] Coverage starting mid-year shows correct month range
- [ ] Future years show "$0 (future year)"
- [ ] Current year shows partial months (not full 12)
- [ ] "All Time" shows total since coverage start

### Calculation Accuracy
- [ ] Total at top matches sum of individual pet premiums
- [ ] Month counting is correct (include both start and end months)
- [ ] Mid-year start dates calculate months correctly
- [ ] Different monthly premium amounts calculate correctly

### UI/UX
- [ ] Text is readable and properly formatted
- [ ] Indentation clearly shows this is a sub-item
- [ ] Context strings are clear and helpful
- [ ] No pets shown that shouldn't be (proper filtering)

## 🐛 Known Issues / Edge Cases to Watch

1. **Timezone Issues**:
   - Date parsing uses `parseYmdLocal()` to avoid timezone shifts
   - Ensure coverage_start_date is stored as YYYY-MM-DD in database

2. **Month Counting**:
   - Current formula: `+1` to include both start and end months
   - Oct 1 → Nov 30 = 2 months (Oct, Nov) ✅

3. **Decimal Months**:
   - We count full months only, not partial months
   - A pet starting Oct 15 counts as 1 full month for October

4. **Premium Changes**:
   - Currently assumes flat rate (monthly_premium doesn't change)
   - If premium changes over time, this won't reflect that

## 🚀 Testing Instructions

### Manual Testing Steps

1. **Add Test Pets**:
   ```
   Pet 1: Angel ($45/mo, started Oct 1, 2025)
   Pet 2: Hope ($45/mo, started Jan 1, 2024)
   Pet 3: Hemingway (no insurance)
   ```

2. **Test Year Filters**:
   - Click "Show expenses for: 2024"
   - Verify Angel shows $0 (coverage started Oct 2025)
   - Verify Hope shows $45/mo × 12 = $540 (2024)
   - Verify Hemingway shows "No insurance"

3. **Test Current Year**:
   - Click "Show expenses for: 2025"
   - Verify Angel shows $45/mo × 2 = $90 (Oct - Nov 2025)
   - Verify Hope shows $45/mo × 11 = $495 (Jan - Nov 2025)

4. **Test All Time**:
   - Click "Show expenses for: All Time"
   - Verify Angel shows $45/mo × 2 = $90 (since Oct 2025)
   - Verify Hope shows $45/mo × 23 = $1,035 (since Jan 2024)

5. **Verify Total Matches**:
   - Add up individual pet premiums
   - Compare to "Insurance Premiums" total line
   - They MUST match exactly

### Console Verification

Open browser DevTools console and verify:
- No JavaScript errors
- FinancialSummary renders without warnings
- Date calculations log correctly if you add console.log statements

## 📊 Visual Example

**Before** (old UI):
```
Insurance Premiums (Monthly insurance cost)          $1,125.00
```

**After** (new UI):
```
Insurance Premiums (Monthly insurance cost)          $1,125.00
  • Angel: $45/mo × 2 = $90 (Oct - Nov 2025)
  • Hope: $45/mo × 11 = $495 (Jan - Nov 2025)
  • Diesel: $45/mo × 12 = $540 (2024)
  • Hemingway: No insurance
```

## 🎯 Success Criteria

✅ Implementation is successful if:

1. Per-pet breakdown is visible and readable
2. All pets with insurance are shown (even if $0)
3. Pets without insurance show "No insurance"
4. Totals match exactly
5. Breakdown updates when changing year filter
6. All edge cases handled gracefully
7. No JavaScript errors in console
8. Calculation logic is transparent to users

## 📝 Code Quality Notes

- ✅ Function is pure (no side effects)
- ✅ Handles null/undefined gracefully
- ✅ Uses descriptive variable names
- ✅ Comments explain complex logic
- ✅ Follows existing code style
- ✅ TypeScript types are correct
- ✅ Edge cases documented and handled

## 🔧 Future Enhancements

Potential improvements for later:

1. **Click to Expand**: Make breakdown collapsible to save space
2. **Premium History**: Show if premium changed over time
3. **Projected Costs**: "If you continue, you'll pay $X by end of year"
4. **Comparison**: "You're paying 15% more than average for your breed"
5. **Savings Calculator**: "If you cancel insurance, you'd save $X but risk $Y"
