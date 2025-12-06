# Amount Display Analysis - Dollar Sign Addition

## Current Situation
Amounts are showing without $ signs in some places, which confuses users:
- Current: "278.05", "58", "26.85"
- Should be: "$278.05", "$58.00", "$26.85"

## Locations Found

### ✅ ALREADY FORMATTED (No changes needed)
These locations already use `fmtMoney()` or similar formatting:

1. **App.tsx:1103-1106** - `fmtMoney` helper function
   ```typescript
   const fmtMoney = (n: number | null | undefined): string => {
     const val = typeof n === 'number' && Number.isFinite(n) ? n : 0
     return `$${val.toFixed(2)}`
   }
   ```
   ✅ Already includes $ and .toFixed(2)

2. **App.tsx:2624** - Claim card amount display
   ```typescript
   <div className="font-mono font-semibold">{fmtMoney(c.total_amount)}</div>
   ```
   ✅ Uses fmtMoney

3. **App.tsx:3062** - Paid modal claimed amount
   ```typescript
   <div className="font-mono font-semibold">{fmtMoney(paidModalClaim.total_amount)}</div>
   ```
   ✅ Uses fmtMoney

4. **App.tsx:3291** - Success modal amount
   ```typescript
   {fmtMoney(successModal.amount || 0)}
   ```
   ✅ Uses fmtMoney

5. **ClaimSubmissionModal.tsx:27** - Submission amount
   ```typescript
   const amount = claim.total_amount ? `$${parseFloat(claim.total_amount).toFixed(2)}` : '$0.00'
   ```
   ✅ Already formatted

6. **FinancialSummary.tsx** - All amounts
   ✅ All amounts use `.toFixed(2)` with $ prefix throughout

---

### ⚠️ INPUT FIELDS (Should NOT add $ prefix)
These are editable input fields where users type numbers:

1. **App.tsx:2191** - Total Amount input (bill entry form)
   ```tsx
   <label>Total Amount</label>
   <input value={extracted.totalAmount} onChange={...} />
   ```
   ⚠️ Keep as-is (input field - user types numbers)

2. **App.tsx:2243** - Line item amount input (bill entry form)
   ```tsx
   <input placeholder="Amount" value={item.amount} onChange={...} />
   ```
   ⚠️ Keep as-is (input field - user types numbers)

3. **App.tsx:3009** - Edit modal line item amount input
   ```tsx
   <input placeholder="Amount" value={it.amount} onChange={...} />
   ```
   ⚠️ Keep as-is (input field - user types numbers)

4. **App.tsx:3067** - Reimbursed amount input
   ```tsx
   <input placeholder="0.00" value={paidAmount} onChange={...} />
   ```
   ⚠️ Keep as-is (input field - user types numbers)

---

### 🔍 NEED TO INVESTIGATE
Need to check if there are any READ-ONLY displays of amounts without formatting:

**Potential locations to check:**
- Line item displays in bill preview/review
- Subtotal calculations
- Any invoice/receipt displays

Let me search for these...
