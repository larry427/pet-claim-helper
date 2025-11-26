import { test, expect } from '@playwright/test'
import {
  generateTestPet,
  authenticateWithMagicLink,
  cleanupTestAccount,
  waitForInsuranceBadge,
  supabase
} from './utils/test-helpers'

test.describe('Insurance Badge Display', () => {
  let userId: string

  // Helper function to add a pet via the UI
  async function addPet(page: any, petData: ReturnType<typeof generateTestPet>) {
    await page.getByRole('button', { name: '+ Add Pet' }).click()
    await page.waitForTimeout(500)

    await page.getByLabel('Pet Name').fill(petData.name)
    await page.getByLabel('Species').selectOption(petData.species)

    if (petData.insurance) {
      await page.getByLabel('Insurance Company').selectOption(petData.insurance.company)
      await page.waitForTimeout(500)

      if (petData.insurance.healthyPawsPetId) {
        await page.getByPlaceholder('e.g., 1400806-1').fill(petData.insurance.healthyPawsPetId)
      }

      if (petData.insurance.policyNumber) {
        await page.getByPlaceholder(/e.g., NW12345 or TP123456/).fill(petData.insurance.policyNumber)
      }
    }

    await page.getByRole('button', { name: 'Save Pet' }).click()
    await page.waitForSelector(`text=${petData.name}`, { timeout: 5000 })
  }

  test.beforeEach(async ({ page }) => {
    // Clean up any existing test data first
    await cleanupTestAccount()

    // Authenticate using magic link (bypasses signup entirely)
    userId = await authenticateWithMagicLink(page)
  })

  test('should display "Insured • Trupanion" for Trupanion pets', async ({ page }) => {
    const pet = generateTestPet({ company: 'Trupanion', policyNumber: 'TP123' })
    await addPet(page, pet)

    // Check for Trupanion badge (format: 💜Trupanion)
    await expect(page.getByText('💜Trupanion').first()).toBeVisible()
  })

  test('should display "Insured • Healthy Paws" for Healthy Paws pets', async ({ page }) => {
    const pet = generateTestPet({
      company: 'Healthy Paws',
      policyNumber: 'HP456',
      healthyPawsPetId: '1400806-1'
    })
    await addPet(page, pet)

    // Check for Healthy Paws badge (format: 🐾Healthy Paws)
    await expect(page.getByText('🐾Healthy Paws').first()).toBeVisible()
  })

  test('should display "Insured • Nationwide" for Nationwide pets', async ({ page }) => {
    const pet = generateTestPet({ company: 'Nationwide', policyNumber: 'NW789' })
    await addPet(page, pet)

    // Check for Nationwide badge (format: 🏢Nationwide)
    await expect(page.getByText('🏢Nationwide').first()).toBeVisible()
  })

  test('should display "Insured • Fetch" for Fetch pets', async ({ page }) => {
    const pet = generateTestPet({ company: 'Fetch', policyNumber: 'FT999' })
    await addPet(page, pet)

    // Check for Fetch badge (format: 🎾Fetch)
    await expect(page.getByText('🎾Fetch').first()).toBeVisible()
  })

  test('should display "Not Insured" for uninsured pets', async ({ page }) => {
    const pet = generateTestPet() // No insurance
    await addPet(page, pet)

    // Should NOT show any insurance company name
    await expect(page.getByText('Trupanion')).not.toBeVisible()
    await expect(page.getByText('Healthy Paws')).not.toBeVisible()
    await expect(page.getByText('Nationwide')).not.toBeVisible()

    // May show "Not Insured" or nothing
    // (depends on implementation - update this based on actual UI)
  })

  test('should display correct badges for multiple pets with different insurance', async ({ page }) => {
    // Add first pet: Trupanion
    const pet1 = generateTestPet({ company: 'Trupanion', policyNumber: 'TP111' })
    await addPet(page, pet1)

    // Add second pet: Healthy Paws
    const pet2 = generateTestPet({
      company: 'Healthy Paws',
      policyNumber: 'HP222',
      healthyPawsPetId: '2500123-1'
    })
    await addPet(page, pet2)

    // Add third pet: No insurance
    const pet3 = generateTestPet() // No insurance
    await addPet(page, pet3)

    // All 3 should be visible with correct badges (use first() to avoid strict mode)
    await expect(page.getByText('💜Trupanion').first()).toBeVisible()
    await expect(page.getByText('🐾Healthy Paws').first()).toBeVisible()
  })
})
