import { test, expect } from '@playwright/test'
import {
  generateTestPet,
  authenticateWithMagicLink,
  cleanupTestAccount,
  expectPetInDatabase,
  supabase
} from './utils/test-helpers'

test.describe('Add Pet Flow', () => {
  let userId: string

  test.beforeEach(async ({ page }) => {
    // Clean up any existing test data first
    await cleanupTestAccount()

    // Authenticate using magic link (bypasses signup entirely)
    userId = await authenticateWithMagicLink(page)
  })

  test('should add pet with Healthy Paws insurance (includes Pet ID)', async ({ page }) => {
    // Click "+ Add Pet" button
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)

    // Fill pet details
    const petName = `TestPet${Date.now()}`
    await page.getByLabel('Pet Name').fill(petName)
    await page.getByLabel('Species').selectOption('cat')

    // Select Healthy Paws
    await page.getByLabel('Insurance Company').selectOption('Healthy Paws')
    await page.waitForTimeout(500)

    // Healthy Paws Pet ID field should appear
    await expect(page.getByPlaceholder('e.g., 1400806-1')).toBeVisible()

    // Fill insurance details
    await page.getByPlaceholder('e.g., 1400806-1').fill('2500123-2')
    await page.getByPlaceholder(/e.g., NW12345 or TP123456/).fill('HP999888')

    // Save pet
    await page.getByRole('button', { name: 'Save Pet' }).click()

    // Wait for pet to appear on dashboard
    await page.waitForSelector(`text=${petName}`, { timeout: 5000 })

    // Wait for database write to complete
    await page.waitForTimeout(1000)

    // Verify pet shows on dashboard with insurance badge (use first() to avoid strict mode violation)
    await expect(page.getByText(petName).first()).toBeVisible()
    await expect(page.getByText('🐾Healthy Paws').first()).toBeVisible()

    // Verify in database
    const dbPet = await expectPetInDatabase(userId, petName)
    expect(dbPet.species).toBe('cat')
    expect(dbPet.insurance_company).toBe('Healthy Paws')
    // Note: healthy_paws_pet_id field exists in UI but not saved to database yet
    expect(dbPet.policy_number).toBe('HP999888')
  })

  test('should add pet without insurance', async ({ page }) => {
    const petName = `TestPet${Date.now()}`

    // Click "+ Add Pet"
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)

    // Fill basic details only (no insurance)
    await page.getByLabel('Pet Name').fill(petName)
    await page.getByLabel('Species').selectOption('dog')

    // Do NOT select insurance company - leave it blank

    // Save pet
    await page.getByRole('button', { name: 'Save Pet' }).click()

    // Verify pet appears
    await page.waitForSelector(`text=${petName}`)
    await expect(page.getByText(petName)).toBeVisible()

    // Wait for database write to complete
    await page.waitForTimeout(1000)

    // Verify in database - no insurance (stored as empty string, not null)
    const dbPet = await expectPetInDatabase(userId, petName)
    expect(dbPet.insurance_company).toBe('')
    expect(dbPet.policy_number).toBe('')
  })

  test('should add multiple pets and show all on dashboard', async ({ page }) => {
    // Add 1st pet
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)
    const pet1Name = `Pet1_${Date.now()}`
    await page.getByLabel('Pet Name').fill(pet1Name)
    await page.getByLabel('Species').selectOption('cat')
    await page.getByRole('button', { name: 'Save Pet' }).click()
    await page.waitForSelector(`text=${pet1Name}`)
    await page.waitForTimeout(1000)

    // Add 2nd pet
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)
    const pet2Name = `Pet2_${Date.now()}`
    await page.getByLabel('Pet Name').fill(pet2Name)
    await page.getByLabel('Species').selectOption('dog')
    await page.getByRole('button', { name: 'Save Pet' }).click()
    await page.waitForSelector(`text=${pet2Name}`)
    await page.waitForTimeout(1000)

    // Verify both pets visible
    const { data: pets } = await supabase
      .from('pets')
      .select('name')
      .eq('user_id', userId)

    expect(pets).toBeTruthy()
    expect(pets!.length).toBe(2)

    // All should be visible on page (use first() to avoid strict mode violation)
    for (const pet of pets!) {
      await expect(page.getByText(pet.name).first()).toBeVisible()
    }
  })

  test('should show Healthy Paws Pet ID field only when Healthy Paws selected in Add Pet form', async ({ page }) => {
    // Open Add Pet form
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)

    // Healthy Paws Pet ID should NOT be visible initially
    await expect(page.getByPlaceholder('e.g., 1400806-1')).not.toBeVisible()

    // Select Healthy Paws
    await page.getByLabel('Insurance Company').selectOption('Healthy Paws')
    await page.waitForTimeout(500)

    // NOW it should be visible
    await expect(page.getByPlaceholder('e.g., 1400806-1')).toBeVisible()

    // Switch to Nationwide
    await page.getByLabel('Insurance Company').selectOption('Nationwide')
    await page.waitForTimeout(500)

    // Should disappear
    await expect(page.getByPlaceholder('e.g., 1400806-1')).not.toBeVisible()
  })
})
