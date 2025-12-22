# Demo & Test Account Management Skill

## Name
Demo Account Management

## Description
Use this skill when working with demo accounts, test mode, email routing, or debugging why claims are going to wrong destinations.

---

## Account Types

### Demo Accounts
- Used for demonstrations and testing
- Claims route to `larry@uglydogadventures.com` (safe)
- Show "Test Mode Active" warning in ClaimSubmissionModal
- Can see Auto-Submit for ALL insurers (even non-production)

**Current Demo Accounts:**
```javascript
const DEMO_ACCOUNTS = [
  'demo@petclaimhelper.com',
  'drsarah@petclaimhelper.com',
  'david@mybenefitexperience.com',
  'larrysecrets@gmail.com'
]
```

### Beta/Real Accounts
- Real users with real insurance
- Claims go to actual insurance companies
- Do NOT show "Test Mode Active" warning
- Only see Auto-Submit for production insurers

### Larry's Accounts
- `larry@uglydogadventures.com` — REAL account with real pets/insurance
- `larrysecrets@gmail.com` — DEMO account for testing

---

## Email Routing Logic

Located in `server/lib/generateClaimPDF.js`:

```javascript
// Check if demo account
const isDemoAccount = DEMO_ACCOUNTS.includes(userEmail.toLowerCase());

if (isDemoAccount) {
  // Route to safe test email
  recipientEmail = 'larry@uglydogadventures.com';
} else {
  // Route to actual insurer
  recipientEmail = getInsurerEmail(insurer);
}
```

### BCC Logic
All submissions send BCC to user's email so they have a record.

---

## Test Mode Warning

In `ClaimSubmissionModal.tsx`:

```javascript
const isTestMode = () => {
  const userEmail = (profile?.email || '').toLowerCase();
  const normalizedInsurer = (insurer || '').toLowerCase();

  const isDemoAccount = DEMO_ACCOUNTS.some(email =>
    email.toLowerCase() === userEmail
  );
  const isProductionInsurer = PRODUCTION_INSURERS.some(prodInsurer =>
    normalizedInsurer.includes(prodInsurer.toLowerCase())
  );

  // Show test mode if demo account OR non-production insurer
  return isDemoAccount || !isProductionInsurer;
};

// In JSX:
{isTestMode() && (
  <div className="test-mode-warning">
    Test Mode Active - sent to larry@uglydogadventures.com
  </div>
)}
```

---

## Production Insurers

Claims for these insurers go to real insurance companies (for non-demo accounts):

```javascript
const PRODUCTION_INSURERS = [
  'pumpkin',
  'spot',
  'healthy paws',
  'nationwide',
  'trupanion',
  'pets best',
  'figo',
  'aspca'
]
```

**Locations to update when adding new insurer:**
1. `server/lib/generateClaimPDF.js` — PRODUCTION_INSURERS array
2. `src/App.tsx` — PRODUCTION_INSURERS array
3. `src/components/ClaimSubmissionModal.tsx` — PRODUCTION_INSURERS constant

---

## Auto-Submit Visibility

In `src/App.tsx`:

```javascript
// Demo accounts see Auto-Submit for ALL insurers
const showAutoSubmit = isDemoAccount || PRODUCTION_INSURERS.includes(normalizedInsurer);
```

---

## Adding a Demo Account

1. Add email to `DEMO_ACCOUNTS` in:
   - `server/lib/generateClaimPDF.js`
   - `src/components/ClaimSubmissionModal.tsx`

2. **DO NOT add real user emails** — this routes their claims to test email!

---

## Common Issues

### Beta Tester Sees "Test Mode Active"

**Cause:** Their email is in DEMO_ACCOUNTS (shouldn't be)

**Fix:** Remove their email from DEMO_ACCOUNTS array

### Demo Account Claims Going to Real Insurer

**Cause:** Email not in DEMO_ACCOUNTS array

**Fix:** Add email to DEMO_ACCOUNTS in `generateClaimPDF.js`

### Test Mode Warning Shows for Production Insurer

**Cause:** Insurer not in PRODUCTION_INSURERS array

**Fix:** Add insurer to PRODUCTION_INSURERS in ClaimSubmissionModal.tsx

### User Not Receiving BCC Copy

**Check:**
1. User's email is set in profile
2. BCC logic is working in sendClaimEmail()
3. Check spam folder

---

## Testing New Features

### Safe Testing Flow

1. Log in as `larrysecrets@gmail.com` (demo account)
2. Create test pet with any insurer
3. Upload vet bill
4. Click Auto-Submit
5. Claims go to `larry@uglydogadventures.com`
6. Verify email received with correct attachments

### Testing with Real Account

1. Log in as `larry@uglydogadventures.com` (real account)
2. Use a PRODUCTION_INSURER (Pumpkin, Spot, etc.)
3. **WARNING:** This sends to REAL insurance company
4. Only do this for actual claim submissions

---

## URL Parameters for Testing

### Force Add-to-Homescreen Modal
```
?showInstall=true
```
Clears localStorage counter and shows modal even if dismissed.

### Future: Test Mode Override (not implemented)
```
?testMode=true
```
Could force test mode for any account (for debugging).

---

## Password Reference

| Account | Email | Password |
|---------|-------|----------|
| Demo | demo@petclaimhelper.com | Brady |
| Demo | larrysecrets@gmail.com | (your password) |
| Real | larry@uglydogadventures.com | (your password) |
