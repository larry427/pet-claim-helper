# Financial Summary & Dashboard Skill

## Name
Financial Summary

## Description
Use this skill when working with the financial dashboard, expense tracking, year filtering, or debugging why totals appear in wrong years.

---

## Core Principle: "Brutal Financial Honesty"

PCH tracks ALL pet costs for complete transparency:
- ✅ Vet bills (covered and uncovered)
- ✅ Insurance premiums paid
- ✅ Out-of-pocket expenses
- ✅ Reimbursements received

**Goal:** Users see their REAL total cost of pet ownership.

---

## Key Data Points

| Metric | Source | Description |
|--------|--------|-------------|
| Total Vet Bills | SUM(vet_bills.total_amount) | All vet expenses |
| Claims Filed | COUNT(vet_bills WHERE status='submitted') | Bills sent to insurer |
| Reimbursements | SUM(vet_bills.reimbursement_amount) | Money back from insurer |
| Premiums Paid | SUM(insurance_premiums.amount) | Monthly premium costs |
| Net Cost | Bills - Reimbursements + Premiums | True out-of-pocket |

---

## Critical Bug: Year Filtering

### The Problem

Bills should appear in the year of **service_date**, NOT **created_at**.

**Example:**
- Checkup on Aug 23, 2024 (service_date)
- Bill uploaded Nov 2, 2025 (created_at)
- Should appear in **2024** totals, NOT 2025

### The Fix

```javascript
// WRONG - uses upload date
const yearBills = bills.filter(b =>
  new Date(b.created_at).getFullYear() === selectedYear
);

// RIGHT - uses service date
const yearBills = bills.filter(b =>
  new Date(b.service_date).getFullYear() === selectedYear
);
```

### Files to Check
- `src/pages/Dashboard.tsx`
- `src/components/FinancialSummary.tsx`
- Any component filtering bills by year

---

## Year Selector Logic

```javascript
// Get all unique years from service_date
const years = [...new Set(
  bills.map(b => new Date(b.service_date).getFullYear())
)].sort((a, b) => b - a); // Newest first

// Default to current year or most recent with data
const defaultYear = years.includes(currentYear) ? currentYear : years[0];
```

---

## Financial Calculations

### Total Expenses (by year)
```javascript
const totalExpenses = bills
  .filter(b => new Date(b.service_date).getFullYear() === year)
  .reduce((sum, b) => sum + parseFloat(b.total_amount || 0), 0);
```

### Reimbursements (by year)
```javascript
const totalReimbursed = bills
  .filter(b =>
    new Date(b.service_date).getFullYear() === year &&
    b.reimbursement_amount
  )
  .reduce((sum, b) => sum + parseFloat(b.reimbursement_amount || 0), 0);
```

### Premiums (by year)
```javascript
const totalPremiums = premiums
  .filter(p => new Date(p.payment_date).getFullYear() === year)
  .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
```

### Net Out-of-Pocket
```javascript
const netCost = totalExpenses - totalReimbursed + totalPremiums;
```

---

## Dashboard Cards

### Bills Summary Card
- Total bills count
- Bills pending submission
- Claims filed
- Claims expiring soon (< 15 days)

### Financial Summary Card
- Total vet expenses (year)
- Total reimbursed (year)
- Total premiums (year)
- Net cost (year)

---

## Insurance Positioning

**IMPORTANT:** PCH positions insurance as PROTECTION, not investment.

**DO:**
- "Track your expenses"
- "Never miss a reimbursement"
- "Know your true pet costs"
- "Protection for unexpected bills"

**DON'T:**
- "Is your insurance paying off?"
- "ROI on your premiums"
- "Get your money's worth"
- Compare premiums to reimbursements as "value"

---

## Debugging Financial Issues

### Total Appears in Wrong Year

1. Check which date field is used (must be service_date)
2. Log the dates:
```javascript
console.log('Bill:', bill.id);
console.log('  service_date:', bill.service_date);
console.log('  created_at:', bill.created_at);
console.log('  Filtering by:', new Date(bill.service_date).getFullYear());
```

### Totals Don't Match

1. Check for null/undefined amounts
2. Check parseFloat conversions
3. Verify filter conditions
4. Log each bill in the sum:
```javascript
bills.forEach(b => {
  console.log(`Bill ${b.id}: ${b.total_amount} (${b.service_date})`);
});
```

### Reimbursements Missing

1. Check if reimbursement_amount is populated
2. Check if status is relevant (some only count 'paid' status)
3. Verify the field name in database

---

## Database Schema (relevant fields)

### vet_bills
| Column | Type | Description |
|--------|------|-------------|
| service_date | DATE | When vet visit occurred |
| created_at | TIMESTAMP | When bill was uploaded |
| total_amount | DECIMAL | Bill total |
| reimbursement_amount | DECIMAL | Amount reimbursed |
| status | TEXT | pending, submitted, paid, denied |

### insurance_premiums
| Column | Type | Description |
|--------|------|-------------|
| payment_date | DATE | When premium was paid |
| amount | DECIMAL | Premium amount |
| pet_id | UUID | Which pet |

---

## Future Enhancements

1. **EOB Upload** — Let users upload Explanation of Benefits to track reimbursements
2. **Auto-premium tracking** — Connect to bank for automatic premium detection
3. **Year-over-year comparison** — Show cost trends
4. **Per-pet breakdown** — Costs by individual pet
5. **Category breakdown** — Wellness vs emergency vs medication
