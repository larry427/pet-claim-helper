import { test, expect } from '@playwright/test'
import {
  generateTestUser,
  generateTestPet,
  signUp,
  completeOnboarding,
  deleteTestUser,
  expectPetInDatabase,
  supabase
} from './utils/test-helpers'

test.describe('Onboarding Flow', () => {
  let testUser: ReturnType<typeof generateTestUser>

  test.beforeEach(() => {
    testUser = generateTestUser()
  })

  test.afterEach(async () => {
    // Cleanup: delete test user and all associated data
    await deleteTestUser(testUser.email)
  })

  test('should complete onboarding with Healthy Paws insurance (includes Pet ID)', async ({ page }) => {
    const pet = generateTestPet({
      company: 'Healthy Paws',
      policyNumber: 'HP123456',
      healthyPawsPetId: '1400806-1'
    })

    // Sign up
    await signUp(page, testUser)

    // Complete onboarding
    await completeOnboarding(page, testUser, pet)

    // Verify pet appears on dashboard
    await expect(page.getByText(pet.name)).toBeVisible()
    await expect(page.getByText('🐾Healthy Paws')).toBeVisible()

    // Verify pet saved to database
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', testUser.email)
      .single()

    expect(user).toBeTruthy()

    const dbPet = await expectPetInDatabase(user!.id, pet.name)
    expect(dbPet.insurance_company).toBe('Healthy Paws')
    expect(dbPet.policy_number).toBe('HP123456')
    expect(dbPet.healthy_paws_pet_id).toBe('1400806-1')
  })

  test('should complete onboarding with Trupanion insurance', async ({ page }) => {
    const pet = generateTestPet({
      company: 'Trupanion',
      policyNumber: 'TP789012'
    })

    await signUp(page, testUser)
    await completeOnboarding(page, testUser, pet)

    // Verify pet appears on dashboard
    await expect(page.getByText(pet.name)).toBeVisible()

    // Verify in database
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', testUser.email)
      .single()

    const dbPet = await expectPetInDatabase(user!.id, pet.name)
    expect(dbPet.insurance_company).toBe('Trupanion')
    expect(dbPet.policy_number).toBe('TP789012')
  })

  test('should complete onboarding with Nationwide insurance', async ({ page }) => {
    const pet = generateTestPet({
      company: 'Nationwide',
      policyNumber: 'NW345678'
    })

    await signUp(page, testUser)
    await completeOnboarding(page, testUser, pet)

    // Verify pet appears on dashboard
    await expect(page.getByText(pet.name)).toBeVisible()

    // Verify in database
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', testUser.email)
      .single()

    const dbPet = await expectPetInDatabase(user!.id, pet.name)
    expect(dbPet.insurance_company).toBe('Nationwide')
    expect(dbPet.policy_number).toBe('NW345678')
  })

  test('should complete onboarding without insurance', async ({ page }) => {
    const pet = generateTestPet() // No insurance

    await signUp(page, testUser)
    await completeOnboarding(page, testUser, pet)

    // Verify pet appears on dashboard
    await expect(page.getByText(pet.name)).toBeVisible()

    // Verify in database
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', testUser.email)
      .single()

    const dbPet = await expectPetInDatabase(user!.id, pet.name)
    expect(dbPet.insurance_company).toBeNull()
    expect(dbPet.policy_number).toBeNull()
  })

  test('should show Healthy Paws Pet ID field only when Healthy Paws selected', async ({ page }) => {
    await signUp(page, testUser)

    // Wait for onboarding Step 1
    await page.waitForSelector('text=Step 1 of 2')

    // Fill Step 1
    await page.getByRole('textbox', { name: /John Smith/ }).fill(testUser.fullName)
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2
    await page.waitForSelector('text=Step 2 of 2')

    // Fill pet name and species
    await page.getByRole('textbox', { name: /Max/ }).fill('TestDog')
    await page.getByRole('combobox').first().selectOption('dog')

    // Healthy Paws Pet ID should NOT be visible yet
    await expect(page.getByPlaceholder('e.g., 1400806-1')).not.toBeVisible()

    // Select Healthy Paws
    await page.getByRole('combobox').nth(1).selectOption('Healthy Paws')

    // Wait a moment for field to appear
    await page.waitForTimeout(500)

    // NOW Healthy Paws Pet ID should be visible
    await expect(page.getByPlaceholder('e.g., 1400806-1')).toBeVisible()
    await expect(page.getByText('Find this on your Healthy Paws policy card or portal')).toBeVisible()

    // Change to different insurance
    await page.getByRole('combobox').nth(1).selectOption('Trupanion')
    await page.waitForTimeout(500)

    // Healthy Paws Pet ID should disappear
    await expect(page.getByPlaceholder('e.g., 1400806-1')).not.toBeVisible()
  })

  test('should NOT show SMS consent checkbox (removed from onboarding)', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // On signup page, SMS consent should be visible (this is account creation)
    await expect(page.getByRole('checkbox', { name: /I agree to receive SMS/ })).toBeVisible()

    // Sign up
    await signUp(page, testUser)

    // In onboarding Step 1, there should be NO SMS consent checkbox
    await page.waitForSelector('text=Step 1 of 2')
    await expect(page.getByText(/SMS/)).not.toBeVisible()
  })

  test('should save user profile data correctly', async ({ page }) => {
    const pet = generateTestPet()

    await signUp(page, testUser)
    await completeOnboarding(page, testUser, pet)

    // Verify profile saved to database
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', testUser.email)
      .single()

    expect(profile).toBeTruthy()
    expect(profile!.full_name).toBe(testUser.fullName)
    expect(profile!.phone).toContain('555') // Should contain phone number
    expect(profile!.address).toBe(testUser.address)
  })
})
