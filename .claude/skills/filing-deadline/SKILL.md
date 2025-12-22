# Filing Deadline Calculation Skill

## Name
Filing Deadline Calculation

## Description
Use this skill when working with claim filing deadlines, debugging incorrect deadline displays, or adding deadline support for new insurers.

---

## How Filing Deadlines Work

1. User uploads vet bill with service_date
2. System looks up insurer's filing window (days allowed to submit)
3. Deadline = service_date + filing_window_days
4. Dashboard shows deadline with color-coded urgency badge

---

## Insurer Filing Windows

| Insurer | Days | Source |
|---------|------|--------|
| Pumpkin | **270** | Confirmed |
| Spot | 270 | Confirmed |
| Healthy Paws | 90 | Default |
| Nationwide | 180 | Estimated |
| Trupanion | 90 | Default |
| Pets Best | 90 | Default |
| Figo | 90 | Default |
| ASPCA | 90 | Default |
| **Default** | 90 | Fallback |

**NOTE:** Always verify with actual insurer policy documents.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/insuranceOptions.ts` | `getFilingDeadline()` function |
| `src/components/VetBillCard.tsx` | Displays deadline badge |
| `src/pages/Dashboard.tsx` | "Claims expiring soon" count |

---

## getFilingDeadline() Function

Located in `src/lib/insuranceOptions.ts`:

```javascript
export function getFilingDeadline(insurer: string): number {
  const normalized = insurer.toLowerCase().trim();

  // Specific insurer windows
  if (normalized.includes('pumpkin')) return 270;
  if (normalized.includes('spot')) return 270;
  if (normalized.includes('nationwide')) return 180;

  // Default fallback
  return 90;
}
```

---

## Deadline Calculation

```javascript
// Calculate deadline from service date
const serviceDate = new Date(claim.service_date);
const filingDays = getFilingDeadline(pet.insurance_company);
const deadline = new Date(serviceDate);
deadline.setDate(deadline.getDate() + filingDays);

// Calculate days remaining
const today = new Date();
const daysRemaining = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
```

---

## Urgency Badge Colors

| Status | Days Remaining | Color | Badge Text |
|--------|---------------|-------|------------|
| Expired | < 0 | Red | "Deadline passed" |
| Urgent | 0-15 | Red | "Expiring soon (< 15 days)" |
| Warning | 16-30 | Yellow | "Due soon" |
| OK | 31+ | Green | "Plenty of time - X days" |

---

## Known Bug: Wrong Deadline Display

**Symptom:** Pumpkin shows "86 days remaining" with deadline "Mar 17, 2026" but should show ~Sep 13, 2026 (270 days)

**Likely Causes:**

1. **getFilingDeadline() returning 90 instead of 270**
   - Check if Pumpkin check is correct
   - Check normalization (lowercase, trim)

2. **Using wrong date**
   - Should use `service_date`, not `created_at`
   - A bill created today for service 6 months ago has different deadline

3. **Calculation error**
   - Adding to wrong date
   - Not using correct number of days

**Debug Steps:**
```javascript
console.log('Insurer:', pet.insurance_company);
console.log('Normalized:', pet.insurance_company.toLowerCase().trim());
console.log('Filing days:', getFilingDeadline(pet.insurance_company));
console.log('Service date:', claim.service_date);
console.log('Calculated deadline:', deadline);
```

---

## Adding Filing Window for New Insurer

1. **Research** the actual policy (check insurer website/documents)

2. **Update getFilingDeadline()**:
```javascript
if (normalized.includes('{insurer}')) return {DAYS};
```

3. **Test** with a vet bill for that insurer

---

## Dashboard "Expiring Soon" Count

Located in Dashboard.tsx:

```javascript
// Count claims expiring within 15 days
const expiringCount = claims.filter(claim => {
  const deadline = calculateDeadline(claim);
  const daysRemaining = getDaysRemaining(deadline);
  return daysRemaining >= 0 && daysRemaining <= 15;
}).length;
```

---

## Date Handling Best Practices

### Use service_date, NOT created_at

```javascript
// WRONG - bill created date doesn't matter
const deadline = new Date(claim.created_at);

// RIGHT - deadline is based on when service occurred
const deadline = new Date(claim.service_date);
```

### Timezone Considerations

```javascript
// Parse date without timezone issues
const [year, month, day] = claim.service_date.split('-');
const serviceDate = new Date(year, month - 1, day); // month is 0-indexed
```

### Display Format

```javascript
// Format: "Mar 17, 2026" or "2026-03-17"
deadline.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});
```

---

## Testing Deadlines

1. Create vet bill with known service_date
2. Verify correct filing window is used for insurer
3. Verify deadline calculation is correct
4. Verify badge shows appropriate color
5. Verify "days remaining" is accurate

**Test cases:**
- Service date today → full filing window
- Service date 30 days ago → filing window minus 30
- Service date > filing window ago → "Deadline passed"
