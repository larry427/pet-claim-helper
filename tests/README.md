# Pet Claim Helper Test Suite

Automated Playwright test suite for Pet Claim Helper. Replaces manual testing and catches bugs before production.

## Quick Start

```bash
# Run all tests (headless)
npm test

# Run with browser visible (for debugging)
npm run test:headed

# Run with Playwright UI (interactive)
npm run test:ui
```

## Test Categories

### 1. Onboarding Tests (`onboarding.spec.ts`)
Tests the 2-step onboarding flow:
- Account creation
- Profile setup (name, phone, address)
- First pet setup with various insurance options
- Healthy Paws Pet ID field conditional visibility
- Data persistence to database

**Run:** `npm run test:onboarding`

### 2. Add Pet Tests (`add-pet.spec.ts`)
Tests adding additional pets after onboarding:
- Adding 2nd and 3rd pets
- Different insurance companies
- Healthy Paws Pet ID field in Add Pet modal
- Pets appearing on dashboard

**Run:** `npm run test:add-pet`

### 3. Settings Page Tests (`settings.spec.ts`)
Tests user settings functionality:
- Only user-level fields shown (no pet/insurance fields)
- Editing name, address, phone
- Email readonly
- Signature section
- Save/cancel behavior

**Run:** `npm run test:settings`

### 4. Insurance Badge Tests (`insurance-badges.spec.ts`)
Tests insurance company badge display:
- Trupanion badge (💜Trupanion)
- Healthy Paws badge (🐾Healthy Paws)
- Nationwide badge (🏢Nationwide)
- Fetch badge (🎾Fetch)
- Multiple pets with different insurance

**Run:** `npm run test:badges`

## Test Structure

```
tests/
├── utils/
│   └── test-helpers.ts     # Shared utilities, fixtures, database helpers
├── onboarding.spec.ts      # Onboarding flow tests
├── add-pet.spec.ts         # Add pet tests
├── settings.spec.ts        # Settings page tests
├── insurance-badges.spec.ts # Badge display tests
└── README.md              # This file
```

## Test Helpers

The `test-helpers.ts` file provides:

- **Test Data Generators**
  - `generateTestEmail()` - Unique test email
  - `generateTestUser()` - Complete test user object
  - `generateTestPet(insurance?)` - Test pet with optional insurance

- **Authentication**
  - `signUp(page, user)` - Create new account
  - `signIn(page, email, password)` - Log in
  - `completeOnboarding(page, user, pet)` - Complete full onboarding

- **Database Operations**
  - `deleteTestUser(email)` - Clean up test data
  - `expectPetInDatabase(userId, petName)` - Verify pet exists
  - `expectClaimInDatabase(userId, claimId)` - Verify claim exists

## Writing New Tests

```typescript
import { test, expect } from '@playwright/test'
import {
  generateTestUser,
  generateTestPet,
  signUp,
  completeOnboarding,
  deleteTestUser
} from './utils/test-helpers'

test.describe('My Feature', () => {
  let testUser: ReturnType<typeof generateTestUser>

  test.beforeEach(() => {
    testUser = generateTestUser()
  })

  test.afterEach(async () => {
    await deleteTestUser(testUser.email)
  })

  test('should do something', async ({ page }) => {
    const pet = generateTestPet({ company: 'Trupanion' })

    await signUp(page, testUser)
    await completeOnboarding(page, testUser, pet)

    // Your test code here
    await expect(page.getByText('Something')).toBeVisible()
  })
})
```

## Environment Variables

Tests use the same `.env.local` environment variables as the app:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

Make sure these are set before running tests.

## Database Cleanup

Each test automatically cleans up after itself:
- `beforeEach` - Creates fresh test user
- `afterEach` - Deletes test user and all associated data (pets, claims, etc.)

This ensures tests are independent and can run in any order.

## Debugging Failed Tests

### 1. Run with headed browser
```bash
npm run test:headed
```

### 2. Run with Playwright UI (best for debugging)
```bash
npm run test:ui
```

### 3. Run specific test
```bash
npx playwright test tests/onboarding.spec.ts --headed --grep "Healthy Paws"
```

### 4. Check test output
Tests log to console. Look for:
- Database query results
- Page navigation
- Element visibility
- Assertion failures

## CI/CD Integration

Tests can run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run tests
  run: npm test
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

## Test Coverage Goals

Current coverage:
- ✅ Onboarding flow
- ✅ Add pet flow
- ✅ Settings page
- ✅ Insurance badges
- ⏳ Auto-submit flow (TODO)
- ⏳ Vet bill upload (TODO)
- ⏳ PDF generation (TODO)

## Performance

Target runtime: **< 5 minutes for full suite**

Current approximate times:
- Onboarding tests: ~1-2 min
- Add pet tests: ~1 min
- Settings tests: ~30 sec
- Badge tests: ~1 min

## Troubleshooting

### Tests failing with "timeout"
- Dev server not running? Start with `npm run dev`
- Slow connection? Increase timeouts in playwright.config.ts

### Tests failing with database errors
- Check Supabase credentials in `.env.local`
- Verify RLS policies allow test user operations
- Check Supabase dashboard for errors

### Tests interfering with each other
- Each test should clean up properly in `afterEach`
- Use unique email/pet names (timestamps)
- Avoid hard-coded IDs

## Best Practices

1. **Keep tests independent** - Each test should work in isolation
2. **Clean up after yourself** - Always delete test data in `afterEach`
3. **Use descriptive names** - Test names should explain what they verify
4. **Test user flows, not implementation** - Test from user perspective
5. **Avoid hard-coded waits** - Use `waitForSelector` instead of `waitForTimeout`

## Support

Questions? Issues? File a bug report or ask in the team chat.
