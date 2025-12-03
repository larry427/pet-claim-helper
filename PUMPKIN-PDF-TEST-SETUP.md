# Pumpkin PDF Automated Testing Setup

## Overview

This document describes the automated testing system for Pumpkin PDF generation. The test ensures that all fields are correctly populated in the generated PDF claim form.

## Test Account Setup

**Account:** larry@uglydogadventures.com (existing account)
**Pet:** Angel (cat, Pumpkin insurance)
**Insurance:** Pumpkin
**Account Number:** 300014693
**Profile Address:** Irvine, CA 92618

### Why This Setup?

Instead of creating a new test account, we're using Larry's existing account with Angel because:
1. Angel already has Pumpkin insurance configured
2. Profile address is already set up
3. Real vet bills exist for testing
4. No email verification required

## Files Created

### 1. Test Credentials
**File:** `.env.test` (gitignored)
```
TEST_EMAIL=larry@uglydogadventures.com
TEST_PASSWORD=<your-actual-password>
```

### 2. Automated Test Script
**File:** `tests/pumpkin-pdf-automated.spec.ts`

This Playwright test:
- Logs in as Larry
- Finds Angel's Pumpkin vet bill
- Clicks "Auto-Submit"
- Fills out MissingFieldsModal (selects "Illness" claim type)
- Waits for PDF generation
- Takes screenshots for verification
- Reports which fields should be verified in the PDF

### 3. Helper Scripts
- `check-test-accounts.cjs` - Check for existing test accounts in database
- `setup-test-account.cjs` - Setup script (not needed since using existing account)
- `check-pets-schema.cjs` - Verify pets table schema

## Running the Automated Test

### Prerequisites
1. Edit `.env.test` and add your actual password
2. Ensure both servers are running:
   ```bash
   # Terminal 1: Frontend
   npm run dev

   # Terminal 2: Backend
   node -r dotenv/config server/index.js dotenv_config_path=server/.env.local
   ```

### Run the Full Test (with browser visible)
```bash
npx playwright test tests/pumpkin-pdf-automated.spec.ts --headed --timeout=120000
```

### Run Quick Test (just trigger PDF generation)
```bash
npx playwright test tests/pumpkin-pdf-automated.spec.ts -g "Quick test" --headed
```

### Run Headless (faster, no browser window)
```bash
npx playwright test tests/pumpkin-pdf-automated.spec.ts
```

## What the Test Verifies

The test triggers PDF generation and reports these expected values:

| Field | Expected Value | Source |
|-------|---------------|--------|
| City | Irvine | profile.city |
| State | CA | profile.state |
| ZIP | 92618 | profile.zip |
| Breed | Cat | pets.species |
| Pumpkin Account Number | 300014693 | pets.pumpkin_account_number |
| Claim Type | Illness (selected in test) | MissingFieldsModal |
| Is this an estimate? | No | Server logic |

## Manual Verification Steps

After running the test:

1. **Check Server Logs**
   ```bash
   # Look for PDF generation output
   tail -f server.log
   ```

2. **Find Generated PDF**
   - Server logs will show the PDF file path
   - Usually in `server/` directory or temp folder

3. **Open PDF and Verify Fields**
   - Open the PDF in Adobe Acrobat or Preview
   - Check each field from the table above:
     - City = "Irvine"
     - State = "CA"
     - ZIP = "92618"
     - Breed = "Cat"
     - Account Number = "300014693"
     - Claim type checkbox is marked (Illness)
     - "Is this an estimate?" = "No" is marked

4. **Check Field Positions**
   - Verify text appears in correct form fields
   - Check that nothing is overlapping
   - Ensure checkboxes are properly marked

## Test Output

The test produces:
- Console output showing each step
- Screenshots in `tests/screenshots/`:
  - `pumpkin-pdf-test-complete.png` - Full page after submission
  - `pumpkin-pdf-quick-test.png` - Quick test result
- Test report (if failures occur)

## Troubleshooting

### Test can't find vet bill
- Verify Angel has a Pumpkin-insured bill with "angel pumpkin autosub test" in description
- Check that bill status is "Not Submitted"

### Login fails
- Update TEST_PASSWORD in `.env.test`
- Make sure you're using the correct password for larry@uglydogadventures.com

### PDF not generated
- Check server logs for errors
- Verify backend server is running on port 8787
- Check that Pumpkin PDF template exists in `server/lib/`

### Wrong field values in PDF
- This indicates a bug in PDF population logic
- File bug report with:
  - Screenshot of generated PDF
  - Expected vs actual values
  - Server logs

## Running After Every PDF Fix

Whenever you update Pumpkin PDF generation code:

```bash
# 1. Restart servers
# 2. Run the automated test
npx playwright test tests/pumpkin-pdf-automated.spec.ts --headed

# 3. Check the generated PDF
# 4. Verify all fields match expected values

# 5. Only claim fix is complete after PDF verification passes
```

## Future Enhancements

Possible improvements to automated testing:
1. Add PDF parsing to automatically verify field values
2. Test multiple claim types (Accident, Preventive, Illness)
3. Test edge cases (missing data, special characters)
4. Compare generated PDF to reference PDF
5. Automated visual regression testing

## Summary

**Test Location:** `tests/pumpkin-pdf-automated.spec.ts`
**Test Account:** larry@uglydogadventures.com
**Run Command:** `npx playwright test tests/pumpkin-pdf-automated.spec.ts --headed`

**DO NOT claim PDF fixes are complete until:**
1. ✅ Automated test runs successfully
2. ✅ Generated PDF is manually verified
3. ✅ All fields match expected values
4. ✅ Field positions are correct
