# E2E Test Suite - Claim Submission

## ✅ Complete Automated Test Suite Created!

### 📁 Files Created

1. **`test/e2e/claim-submission-full.spec.ts`** - Main test suite
   - Tests all 3 insurers (Trupanion, Nationwide, Healthy Paws)
   - Verifies preview functionality (2 tabs: claim form + invoice)
   - Checks submission success
   - Email verification hooks (Gmail integration)

2. **`test/e2e/setup-test-environment.ts`** - One-time setup script
   - Creates test user: `test-automation@petclaimhelper.com`
   - Creates 3 test pets (one per insurer)
   - Generates dummy vet bill PDFs
   - Sets up Gmail session persistence

3. **`test/e2e/README.md`** - Comprehensive documentation
   - Setup instructions
   - Usage examples
   - Troubleshooting guide
   - CI/CD integration

4. **`run-e2e-tests.sh`** - Quick-start runner script
   - Automated setup check
   - Easy test execution
   - Report viewing

5. **`playwright.config.ts`** - Updated configuration
   - Production and local test modes
   - Sequential execution
   - Screenshot and video capture

6. **Test directories created:**
   - `test/e2e/` - Test files
   - `test/vet-bills/` - Vet bill PDFs
   - `.playwright-mcp/gmail-session/` - Gmail session storage
   - `.playwright-mcp/` - Screenshot output

---

## 🚀 Quick Start

### 1. First-Time Setup (One Time Only)

```bash
npx ts-node test/e2e/setup-test-environment.ts
```

**This will:**
- Create test user and 3 test pets in Supabase
- Generate 3 dummy vet bill PDFs
- Open browser for Gmail login (manual step)
- Save Gmail session for future tests

**Manual Step**: When browser opens, login to:
- Tab 1: `larry@uglydogadventures.com`
- Tab 2: `larry@vrexistence.com`

Press ENTER after logging in to save session.

### 2. Run Tests

**Simple way:**
```bash
./run-e2e-tests.sh
```

**Or manually:**
```bash
# Test production
npx playwright test test/e2e/claim-submission-full.spec.ts

# Test local
TEST_ENV=local npx playwright test test/e2e/claim-submission-full.spec.ts
```

### 3. View Results

```bash
npx playwright show-report
```

---

## 📊 What Gets Tested

### For Each Insurer (Trupanion, Nationwide, Healthy Paws):

1. ✅ **Login** - User authentication
2. ✅ **Pet Selection** - Correct pet selected for insurer
3. ✅ **Vet Bill Upload** - PDF upload functionality
4. ✅ **Claim Creation** - Save claim successfully
5. ✅ **Preview Verification** - **CRITICAL TEST**
   - Exactly 2 tabs must open
   - Tab 1: Filled claim form PDF
   - Tab 2: Uploaded vet invoice PDF
6. ✅ **Submission** - Submit claim to insurance
7. ✅ **Email Verification** - Check both Gmail accounts
   - BCC: `larry@uglydogadventures.com`
   - TO: `larry@vrexistence.com`
   - Both must have 2 attachments

### Pass Criteria

**Test PASSES if ALL of these are true:**
- ✅ Login successful
- ✅ Claim created
- ✅ **Preview opens 2 tabs** (claim form + invoice)
- ✅ Submission confirmed
- ✅ Emails sent with 2 attachments each

---

## 🐛 Bug Detection

### The Test Will Catch:

1. **Missing Invoice in Preview**
   - If preview only opens 1 tab instead of 2
   - If invoice PDF is missing

2. **Missing Invoice in Email**
   - If email only has 1 attachment (claim form)
   - If invoice PDF is not attached

3. **Submission Failures**
   - If auto-submit doesn't work
   - If confirmation message doesn't appear

4. **Upload Issues**
   - If vet bill PDF fails to upload
   - If file processing errors occur

---

## 📸 Output Examples

### Console Output
```
🧪 PLAYWRIGHT E2E TEST - CLAIM SUBMISSION
Environment: Production (https://pet-claim-helper.vercel.app)

━━━ TRUPANION ━━━
✅ Login successful
✅ Pet selected: TestDog-Trupanion
✅ Vet bill uploaded: trupanion-bill.pdf (547 KB)
✅ Claim created: claim-abc123
✅ Preview: 2 tabs opened ✓
   📸 trupanion-3-preview-claim-form.png
   📸 trupanion-4-preview-invoice.png
✅ Submission: Confirmed at 10:23:45 AM
RESULT: ✅ PASS

━━━ NATIONWIDE ━━━
❌ Preview: Only 1 tab opened! (Expected 2)
RESULT: ❌ FAIL - Invoice missing

📊 FINAL RESULTS: 2/3 PASSED
```

### Screenshots Generated
```
.playwright-mcp/
├── trupanion-1-login-success.png
├── trupanion-2-claim-created.png
├── trupanion-3-preview-claim-form.png
├── trupanion-4-preview-invoice.png
├── trupanion-5-submission-confirmed.png
├── nationwide-1-login-success.png
├── nationwide-2-claim-created.png
├── nationwide-3-preview-FAIL.png
└── ...
```

---

## 🔄 Gmail Session Persistence

### First Run
- Browser opens with 2 Gmail tabs
- You manually login to both accounts
- Session saved to `.playwright-mcp/gmail-session/`

### Subsequent Runs
- Tests automatically load saved session
- No login required
- Instant email access

### Reset Session
```bash
rm -rf .playwright-mcp/gmail-session/
npx ts-node test/e2e/setup-test-environment.ts
```

---

## 🎯 Key Features

1. **✅ Comprehensive Coverage**
   - All 3 insurers tested
   - Full claim submission flow
   - Email delivery verification

2. **✅ Gmail Session Persistence**
   - Login once, reuse forever
   - No repeated manual logins
   - Faster test execution

3. **✅ Preview Verification**
   - Counts exact number of tabs opened
   - Verifies both claim form and invoice
   - Screenshots of each tab

4. **✅ Detailed Reporting**
   - Console output with emojis
   - HTML report with screenshots
   - Pass/fail summary per insurer

5. **✅ Easy to Run**
   - Single command: `./run-e2e-tests.sh`
   - Automated setup checks
   - Interactive prompts

---

## 🛠️ Technical Details

### Test Architecture
- **Framework**: Playwright Test
- **Language**: TypeScript
- **Execution**: Sequential (one insurer at a time)
- **Timeout**: 2 minutes per test
- **Browser**: Chromium (headless)

### Environment Variables
- `TEST_ENV=local` - Test against localhost:5173
- (default) - Test against production

### Dependencies
- `@playwright/test` - Already in package.json
- `playwright` chromium browser

---

## 📝 Next Steps

1. **Run Setup (First Time)**
   ```bash
   npx ts-node test/e2e/setup-test-environment.ts
   ```

2. **Run Tests**
   ```bash
   ./run-e2e-tests.sh
   ```

3. **Review Results**
   - Check console output
   - View HTML report
   - Examine screenshots

4. **Fix Any Failures**
   - If preview fails: Check PDF generation code
   - If email fails: Check attachment logic
   - If submission fails: Check API endpoints

---

## 🎉 Summary

You now have a **complete, production-ready E2E test suite** that:

✅ Tests all 3 insurers automatically
✅ Verifies the critical preview bug (2 tabs with both PDFs)
✅ Checks email delivery with attachments
✅ Saves Gmail sessions for fast re-runs
✅ Generates detailed reports with screenshots
✅ Provides clear pass/fail results

**Run it now to verify your claim submission flow works correctly!**

```bash
./run-e2e-tests.sh
```
