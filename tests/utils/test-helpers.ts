import { Page, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Supabase client for test database operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

// Admin client for magic link generation
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Test account to use (existing verified account)
const TEST_ACCOUNT_EMAIL = 'larry@uglydogadventures.com'
const TEST_ACCOUNT_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // Larry's user ID

// Test data generators
export function generateTestEmail() {
  const timestamp = Date.now()
  // Email verification is disabled in Supabase for testing
  // Use unique Gmail addresses for each test
  return `playwright.tests+${timestamp}@gmail.com`
}

export function generateTestUser() {
  return {
    email: generateTestEmail(),
    password: 'TestPassword123!',
    fullName: 'Test User',
    phone: '(555) 123-4567',
    address: '123 Test St, Test City, TS 12345'
  }
}

export function generateTestPet(insurance?: {
  company: string
  policyNumber?: string
  healthyPawsPetId?: string
}) {
  return {
    name: `TestPet${Date.now()}`,
    species: 'dog' as const,
    insurance: insurance || null
  }
}

// NEW: Simple password login (uses existing verified account)
export async function authenticateWithMagicLink(page: Page): Promise<string> {
  await page.goto('http://localhost:5173')
  await page.waitForTimeout(1000)

  // Check if already logged in
  const loggedInText = page.getByText('Logged in as:')
  if (await loggedInText.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Close onboarding modal if it appears
    const onboardingModal = page.getByText('Step 1 of 2')
    if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.waitForTimeout(500)
    }
    return TEST_ACCOUNT_USER_ID
  }

  // Login with password
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByLabel('Email', { exact: true }).fill(TEST_ACCOUNT_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill('123456') // Larry's password
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForTimeout(2000)

  // Wait for dashboard to load (user is now authenticated)
  await page.waitForSelector('text=Your Pets', { timeout: 10000 })

  // Close onboarding modal if it appears (happens when user has no pets)
  const onboardingModal = page.getByText('Step 1 of 2')
  if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)
  }

  return TEST_ACCOUNT_USER_ID
}

// Clean up test data for Larry's account before each test
export async function cleanupTestAccount() {
  // Delete all pets for test account
  await supabaseAdmin.from('pets').delete().eq('user_id', TEST_ACCOUNT_USER_ID)

  // Delete all claims for test account
  await supabaseAdmin.from('claims').delete().eq('user_id', TEST_ACCOUNT_USER_ID)

  // Delete all medications for test account
  await supabaseAdmin.from('medications').delete().eq('user_id', TEST_ACCOUNT_USER_ID)

  // Note: We don't delete the profile itself, just the test data
}

// OLD: Signup function (DEPRECATED - use authenticateWithMagicLink instead)
// This is kept for reference but should not be used in new tests
export async function signUp(page: Page, user: ReturnType<typeof generateTestUser>) {
  await page.goto('http://localhost:5173')

  // Fill signup form
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email)
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password)
  await page.getByRole('textbox', { name: /Phone Number/ }).fill(user.phone)
  await page.getByRole('checkbox', { name: /I agree to receive SMS/ }).check()

  // Submit
  await page.getByRole('button', { name: 'Sign Up' }).click()

  // Email verification is disabled, so onboarding should appear immediately
  // Wait for onboarding modal to open
  await page.waitForSelector('text=Step 1 of 2', { timeout: 15000 })
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('http://localhost:5173')

  // Switch to sign in
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Fill login form
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)

  // Submit
  await page.getByRole('button', { name: 'Log In' }).click()

  // Wait for dashboard to load
  await page.waitForSelector('text=Your Pets', { timeout: 10000 })
}

export async function completeOnboarding(
  page: Page,
  user: ReturnType<typeof generateTestUser>,
  pet: ReturnType<typeof generateTestPet>
) {
  // Wait for onboarding modal - Step 1
  await page.waitForSelector('text=Step 1 of 2', { timeout: 10000 })

  // Fill Step 1 - Profile
  await page.getByRole('textbox', { name: /John Smith/ }).fill(user.fullName)
  await page.getByRole('textbox', { name: /\(555\) 123-4567/ }).nth(0).fill(user.phone)
  await page.getByRole('textbox', { name: /123 Main St/ }).fill(user.address)

  // Next to Step 2
  await page.getByRole('button', { name: 'Next' }).click()

  // Wait for Step 2
  await page.waitForSelector('text=Step 2 of 2', { timeout: 5000 })

  // Fill Step 2 - Pet
  await page.getByRole('textbox', { name: /Max/ }).fill(pet.name)
  await page.getByRole('combobox').first().selectOption(pet.species)

  // If insurance info provided
  if (pet.insurance) {
    await page.getByRole('combobox').nth(1).selectOption(pet.insurance.company)

    // Wait for insurance fields to appear
    await page.waitForTimeout(500)

    // Fill Healthy Paws Pet ID if applicable
    if (pet.insurance.company === 'Healthy Paws' && pet.insurance.healthyPawsPetId) {
      await page.getByPlaceholder('e.g., 1400806-1').fill(pet.insurance.healthyPawsPetId)
    }

    // Fill policy number if provided
    if (pet.insurance.policyNumber) {
      await page.getByPlaceholder(/e.g., NW12345 or TP123456/).fill(pet.insurance.policyNumber)
    }
  }

  // Finish onboarding
  await page.getByRole('button', { name: 'Finish Setup' }).click()

  // Wait for success screen
  await page.waitForSelector('text=You\'re all set!', { timeout: 10000 })

  // Click Get Started
  await page.getByRole('button', { name: 'Get Started' }).click()

  // Wait for dashboard
  await page.waitForSelector('text=Your Pets', { timeout: 5000 })
}

// Database cleanup helpers
export async function deleteTestUser(email: string) {
  // Get user by email
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (!user) return

  // Delete user's pets
  await supabase.from('pets').delete().eq('user_id', user.id)

  // Delete user's claims
  await supabase.from('claims').delete().eq('user_id', user.id)

  // Delete user's medications
  await supabase.from('medications').delete().eq('user_id', user.id)

  // Delete profile
  await supabase.from('profiles').delete().eq('id', user.id)

  // Note: Supabase auth user deletion requires admin API
  // For now, just clean up database records
}

// Assertion helpers
export async function expectPetInDatabase(userId: string, petName: string) {
  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('name', petName)

  expect(pets).toBeTruthy()
  expect(pets?.length).toBeGreaterThan(0)
  return pets![0]
}

export async function expectClaimInDatabase(userId: string, claimId: string) {
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)
    .eq('id', claimId)
    .single()

  expect(claim).toBeTruthy()
  return claim
}

// Wait helpers
export async function waitForPetToAppear(page: Page, petName: string) {
  await page.waitForSelector(`text=${petName}`, { timeout: 10000 })
}

export async function waitForInsuranceBadge(page: Page, companyName: string) {
  await page.waitForSelector(`text=Insured • ${companyName}`, { timeout: 5000 })
}
