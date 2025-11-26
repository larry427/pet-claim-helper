# E2E Test Suite - Claim Submission

Automated end-to-end tests for claim submission across all 3 insurers: Trupanion, Nationwide, and Healthy Paws.

## Features

- ✅ Tests claim submission for all 3 insurers
- ✅ Verifies preview functionality (2 tabs: claim form + invoice)
- ✅ Gmail session persistence (login once, reuse forever)
- ✅ Email verification with attachment checking
- ✅ Comprehensive screenshot capture
- ✅ Detailed test reports

## Prerequisites

```bash
npm install @playwright/test
npx playwright install chromium
```

## First-Time Setup

Run the setup script to create test user, pets, and Gmail session:

```bash
npx ts-node test/e2e/setup-test-environment.ts
```

This will:
1. Create test user: `test-automation@petclaimhelper.com`
2. Create 3 test pets (one for each insurer)
3. Create dummy vet bill PDFs
4. Open browser for Gmail manual login (one-time only)

**Manual Step**: When browser opens, login to both Gmail accounts:
- Tab 1: `larry@uglydogadventures.com`
- Tab 2: `larry@vrexistence.com`

After logging in, press ENTER to save the session. Future tests will auto-login.

## Running Tests

### Test Against Production

```bash
npx playwright test test/e2e/claim-submission-full.spec.ts
```

### Test Against Local (http://localhost:5173)

```bash
TEST_ENV=local npx playwright test test/e2e/claim-submission-full.spec.ts
```

### Run with UI Mode (Interactive)

```bash
npx playwright test test/e2e/claim-submission-full.spec.ts --ui
```

### Run Single Insurer

```bash
npx playwright test test/e2e/claim-submission-full.spec.ts -g "Trupanion"
```

## Test Output

### Console Output

```
🧪 PLAYWRIGHT E2E TEST - CLAIM SUBMISSION
Environment: Production (https://pet-claim-helper.vercel.app)
Test User: test-automation@petclaimhelper.com
Email Check: SPAM folders only (inbox ignored)

━━━ TRUPANION ━━━
✅ Login successful
✅ Pet selected: TestDog-Trupanion
✅ Vet bill uploaded: trupanion-bill.pdf (547 KB)
✅ Claim created: claim-abc123
✅ Preview: 2 tabs opened ✓
✅ Submission: Confirmed at 10:23:45 AM
RESULT: ✅ PASS

━━━ NATIONWIDE ━━━
✅ Login successful
❌ Preview: Only 1 tab opened! (Expected 2)
RESULT: ❌ FAIL

━━━ HEALTHY PAWS ━━━
✅ Login successful
✅ Preview: 2 tabs opened ✓
RESULT: ✅ PASS

━━━━━━━━━━━━━━━━━━━━━━
📊 FINAL RESULTS: 2/3 PASSED
```

### Screenshots

All screenshots saved to: `.playwright-mcp/`

- `[insurer]-1-login-success.png`
- `[insurer]-2-claim-created.png`
- `[insurer]-3-preview-claim-form.png`
- `[insurer]-4-preview-invoice.png`
- `[insurer]-5-submission-confirmed.png`
- `[insurer]-6-email-uglydogadventures.png`
- `[insurer]-7-email-vrexistence.png`

### HTML Report

```bash
npx playwright show-report
```

## Gmail Session Management

Session saved to: `.playwright-mcp/gmail-session/`

### Reset Gmail Session

If you need to re-login to Gmail:

```bash
rm -rf .playwright-mcp/gmail-session/
npx ts-node test/e2e/setup-test-environment.ts
```

## Test Details

### What Each Test Verifies

1. **Login**: User can login with test credentials
2. **Claim Creation**: Vet bill can be uploaded and claim created
3. **Preview Functionality**:
   - Click preview opens exactly 2 tabs
   - Tab 1: Filled claim form PDF
   - Tab 2: Uploaded vet invoice PDF
4. **Submission**: Claim submits successfully
5. **Email Delivery**:
   - BCC email to `larry@uglydogadventures.com`
   - TO email to `larry@vrexistence.com`
   - Both emails have 2 attachments (claim form + invoice)

### Pass Criteria

A test PASSES if:
- ✅ Login successful
- ✅ Claim created
- ✅ Preview opens 2 tabs (claim form + invoice)
- ✅ Submission confirmed
- ✅ Both emails received with 2 attachments each

## Troubleshooting

### "Gmail session not found"

Run setup script: `npx ts-node test/e2e/setup-test-environment.ts`

### "Test user not found"

Run setup script to create test user and pets.

### "Vet bills missing"

Dummy PDFs are auto-created in `test/vet-bills/`. Or copy real vet bills there.

### Preview only opens 1 tab

This indicates a bug where the vet invoice is not being attached. Check:
- Claim form generation code
- Email attachment logic
- PDF merging/concatenation

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Run E2E Tests
  run: |
    npx playwright test test/e2e/claim-submission-full.spec.ts
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

**Note**: Gmail verification step will be skipped in CI (manual verification only).
