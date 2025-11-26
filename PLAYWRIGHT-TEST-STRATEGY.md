# Playwright Test Suite - Current Status & Strategy

## ✅ What's Been Built

**Complete test infrastructure with 22+ tests:**
- Onboarding flow tests (7 tests)
- Add pet tests (4 tests)
- Settings page tests (5 tests)
- Insurance badge tests (6 tests)
- Test utilities and helpers
- Complete documentation

**Files Created:**
- `tests/utils/test-helpers.ts` - Shared utilities
- `tests/onboarding.spec.ts` - Onboarding tests
- `tests/add-pet.spec.ts` - Add pet tests
- `tests/settings.spec.ts` - Settings tests
- `tests/insurance-badges.spec.ts` - Badge tests
- `tests/README.md` - Documentation
- `TEST-SUITE-SUMMARY.md` - Complete guide

## ⚠️ Current Blocker: Email Verification

**Problem:** Supabase requires email verification for new accounts, which blocks automated testing.

**What We Tried:**
1. ✗ `@playwright.test` domain - Rejected by Supabase as invalid
2. ✗ `@example.com` domain - Rejected by Supabase as invalid
3. ✗ `@gmail.com` with + addressing - Accepted BUT requires email verification before onboarding

**Root Cause:** After signup, users must verify their email before accessing the app. Automated tests can't check real emails.

## 🔧 Solutions (Pick One)

### Option 1: Use Magic Links (RECOMMENDED)
Use the existing `quick-login.cjs` script to generate magic links for authentication, bypassing signup entirely.

**Pros:**
- No email verification needed
- Fast and reliable
- Uses existing verified account

**Cons:**
- Can't test the signup flow itself
- All tests use same account (need careful cleanup)

**Implementation:**
```typescript
// Create a helper that generates and uses magic link
export async function loginWithMagicLink(page: Page) {
  // Generate magic link using Supabase admin API
  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'test@example.com'
  })

  // Navigate to magic link
  await page.goto(data.properties.action_link)

  // Wait for dashboard
  await page.waitForSelector('text=Your Pets')
}
```

### Option 2: Disable Email Verification for Tests
Configure Supabase to skip email verification for test environment.

**Pros:**
- Can test full signup flow
- Each test gets its own account

**Cons:**
- Requires Supabase configuration changes
- Different behavior than production

**Implementation:**
- Update Supabase project settings to disable email confirmation
- OR use separate test Supabase project with confirmation disabled

### Option 3: Use Test Email Service
Use a service like Mailinator, Mailtrap, or Ethereal that provides programmatic email access.

**Pros:**
- Tests full email verification flow
- Most realistic testing

**Cons:**
- More complex
- Slower tests
- Requires external service

**Implementation:**
```typescript
// Use Mailinator API to check for verification email
const response = await fetch(`https://api.mailinator.com/v2/domains/public/inboxes/${inbox}/messages`)
const message = response.data.msgs[0]
const verificationLink = extractLinkFromEmail(message.body)
await page.goto(verificationLink)
```

### Option 4: Use Existing Verified Account
All tests use Larry's existing verified account with careful cleanup.

**Pros:**
- Simple
- No configuration needed

**Cons:**
- Tests can interfere with each other
- Can't test signup flow
- Must clean up thoroughly between tests

**Implementation:**
```typescript
// Clean all data before each test
test.beforeEach(async () => {
  await supabase.from('pets').delete().eq('user_id', LARRY_USER_ID)
  await supabase.from('claims').delete().eq('user_id', LARRY_USER_ID)
})
```

## 🎯 Recommended Approach

**Use Option 1 (Magic Links) + Option 4 (Existing Account)**

1. Use Larry's existing verified account for all tests
2. Generate magic links programmatically for authentication
3. Clean up ALL test data before each test
4. Skip testing the signup flow itself (test manually or separately)

This gives us:
- ✅ Fast, reliable tests
- ✅ No email verification issues
- ✅ Tests all features except signup
- ✅ Easy to maintain

## 📝 Next Steps to Fix Tests

1. **Update `signUp()` helper** to use magic link instead:
```typescript
export async function authenticateTestUser(page: Page) {
  // Use quick-login.cjs approach
  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'larry@uglydogadventures.com',
    options: {
      redirectTo: 'http://localhost:5173'
    }
  })

  await page.goto(data.properties.action_link)
  await page.waitForSelector('text=Your Pets', { timeout: 10000 })
}
```

2. **Update `beforeEach`** to clean test data:
```typescript
test.beforeEach(async () => {
  await cleanupTestData('larry@uglydogadventures.com')
})
```

3. **Create `cleanupTestData()` helper**:
```typescript
export async function cleanupTestData(email: string) {
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (user) {
    // Delete in order (foreign keys)
    await supabase.from('medications').delete().eq('user_id', user.id)
    await supabase.from('claims').delete().eq('user_id', user.id)
    await supabase.from('pets').delete().eq('user_id', user.id)
  }
}
```

4. **Skip onboarding tests** (or test manually):
- Onboarding requires signup, which requires email verification
- Either skip these or test them manually
- Focus tests on features AFTER onboarding

## 📊 Test Coverage After Fix

**What WILL be tested:**
- ✅ Add pet functionality
- ✅ Edit pet functionality
- ✅ Settings page
- ✅ Insurance badges
- ✅ Auto-submit (future)
- ✅ Vet bill upload (future)

**What WON'T be tested:**
- ❌ Signup flow (test manually)
- ❌ Email verification (test manually)
- ❌ Onboarding modal (test manually)

## 🚀 Ready to Implement?

The fix is straightforward:
1. Update test helpers to use magic links
2. Add cleanup before each test
3. Skip/comment out onboarding tests
4. Re-run tests

**Estimated time:** 30 minutes
**Expected result:** All 15+ tests passing (minus onboarding tests)
