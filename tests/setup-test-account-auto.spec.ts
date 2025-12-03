import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'pch-test@petclaimhelper.com'
const TEST_PASSWORD = 'TestPassword123!'

test('Setup test account automatically', async ({ page }) => {
  console.log('🔧 Setting up test account via Playwright...\n')

  // Navigate to the app
  await page.goto('http://localhost:5173')
  await page.waitForLoadState('networkidle')

  // Check if we're already logged in
  const logoutButton = page.getByRole('button', { name: /logout/i })
  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('📤 Logging out existing session...')
    await logoutButton.click()
    await page.waitForTimeout(1000)
  }

  // Click "Create Account" tab
  console.log('📝 Creating new account...')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForTimeout(500)

  // Fill in registration form
  await page.getByLabel(/email/i).fill(TEST_EMAIL)
  await page.getByLabel(/password/i).first().fill(TEST_PASSWORD)

  // Click "Create Account" button
  await page.getByRole('button', { name: /create account/i }).last().click()

  // Wait for account creation
  await page.waitForTimeout(3000)

  // Check for success or error
  const errorMessage = await page.getByText(/already registered/i).isVisible({ timeout: 2000 }).catch(() => false)

  if (errorMessage) {
    console.log('⚠️  Account already exists, trying to log in instead...')

    // Go back to sign in
    await page.goto('http://localhost:5173')
    await page.waitForTimeout(1000)

    // Click Sign In tab
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(500)

    // Login
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /log in/i }).click()

    await page.waitForTimeout(2000)
  } else {
    console.log('✅ Account created successfully')
    console.log('⚠️  Check email for verification link (or skip if auto-confirm is enabled)')
    await page.waitForTimeout(2000)
  }

  // Check if onboarding modal appears
  const onboardingModal = page.getByText(/welcome.*pet claim helper/i)
  const hasOnboarding = await onboardingModal.isVisible({ timeout: 3000 }).catch(() => false)

  if (hasOnboarding) {
    console.log('📋 Completing onboarding...')

    // Fill in full name
    await page.getByPlaceholder(/john doe/i).fill('Test User')

    // Fill in address fields
    await page.getByPlaceholder(/123 main/i).fill('123 Test Street')
    await page.getByPlaceholder(/city/i).fill('Testville')

    // Select state
    const stateSelect = page.locator('select').filter({ hasText: /select state/i })
    await stateSelect.selectOption('CA')

    // Fill in ZIP
    await page.getByPlaceholder(/12345/i).fill('90210')

    // Fill in phone
    await page.getByPlaceholder(/555.*123.*4567/i).fill('555-123-4567')

    // Click Get Started
    await page.getByRole('button', { name: /get started/i }).click()
    await page.waitForTimeout(2000)

    console.log('✅ Onboarding completed')
  }

  // Add a test pet
  console.log('🐾 Adding test pet...')

  const addPetButton = page.getByRole('button', { name: /add pet/i })
  await addPetButton.click()
  await page.waitForTimeout(1000)

  // Fill pet form
  await page.getByPlaceholder(/pet.*name/i).fill('TestPet')

  // Select species: cat
  await page.getByRole('radio', { name: /cat/i }).click()

  // Fill breed
  await page.getByPlaceholder(/breed/i).fill('Tabby')

  // Fill age
  await page.getByPlaceholder(/age/i).fill('5')

  // Select insurer: Pumpkin
  const insurerSelect = page.locator('select').filter({ hasText: /select.*insurance/i })
  await insurerSelect.selectOption('pumpkin')
  await page.waitForTimeout(500)

  // Fill policy number
  await page.getByPlaceholder(/policy.*number/i).fill('TEST-123456')

  // Save pet
  await page.getByRole('button', { name: /save/i }).click()
  await page.waitForTimeout(2000)

  console.log('✅ Test pet added')

  // Take a screenshot
  await page.screenshot({ path: 'tests/screenshots/test-account-setup-complete.png', fullPage: true })

  console.log('\n' + '='.repeat(60))
  console.log('✅ TEST ACCOUNT SETUP COMPLETE')
  console.log('='.repeat(60))
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Password: ${TEST_PASSWORD}`)
  console.log('Profile: Test User, 123 Test Street, Testville, CA 90210')
  console.log('Pet: TestPet (cat, Tabby, 5 years)')
  console.log('Insurance: Pumpkin, Policy: TEST-123456')
  console.log('='.repeat(60) + '\n')
})
