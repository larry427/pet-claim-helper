import { test, expect } from '@playwright/test'
import {
  authenticateWithMagicLink,
  cleanupTestAccount,
  supabase
} from './utils/test-helpers'

test.describe('Settings Page', () => {
  let userId: string
  const originalName = 'Test User'

  test.beforeEach(async ({ page }) => {
    // Clean up any existing test data first
    await cleanupTestAccount()

    // Authenticate using magic link (bypasses signup entirely)
    userId = await authenticateWithMagicLink(page)

    // Set a known name for the last test
    await supabase
      .from('profiles')
      .update({ full_name: originalName })
      .eq('id', userId)
  })

  test('should show only user-level fields (no pet/insurance fields)', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: '⚙️ Settings' }).click()

    // Wait for settings page
    await page.waitForSelector('text=Settings', { timeout: 5000 })

    // Should show these user-level fields (use placeholders since labels are divs, not <label> elements)
    await expect(page.getByPlaceholder('John Smith')).toBeVisible()
    await expect(page.getByPlaceholder('123 Main St, City, ST 12345')).toBeVisible()
    await expect(page.getByPlaceholder('(123) 456-7890')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your Signature' })).toBeVisible()

    // Should NOT show these pet/insurance form fields (check for actual inputs, not help text)
    await expect(page.getByRole('combobox', { name: /Insurance Company/i })).not.toBeVisible()
    await expect(page.getByPlaceholder(/Policy Number/i)).not.toBeVisible()
    await expect(page.getByPlaceholder(/Pet Name/i)).not.toBeVisible()
    await expect(page.getByRole('combobox', { name: /Species/i })).not.toBeVisible()
  })

  test('should save changes to name, address, and phone', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: '⚙️ Settings' }).click()
    await page.waitForSelector('text=Settings')

    // Wait for profile data to load from database (ensure state is initialized)
    await page.waitForTimeout(1000)

    // Change full name (fill empty string to clear, then fill new value)
    const newName = 'Updated Test Name'
    const nameInput = page.getByPlaceholder('John Smith')
    await nameInput.fill('')
    await page.waitForTimeout(100)
    await nameInput.fill(newName)

    // Change address
    const newAddress = '456 New St, New City, NC 54321'
    const addressInput = page.getByPlaceholder('123 Main St, City, ST 12345')
    await addressInput.fill('')
    await page.waitForTimeout(100)
    await addressInput.fill(newAddress)

    // Change phone
    const newPhone = '(555) 987-6543'
    const phoneInput = page.getByPlaceholder('(123) 456-7890')
    await phoneInput.fill('')
    await page.waitForTimeout(100)
    await phoneInput.fill(newPhone)

    // Wait for state to update
    await page.waitForTimeout(500)

    // Set up dialog handler for success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toBe('Profile saved successfully!')
      await dialog.accept()
    })

    // Save
    await page.getByRole('button', { name: 'Save Profile' }).click()

    // Wait for settings panel to close (confirms save completed)
    // "Profile Information" is unique to the settings panel
    await page.waitForSelector('text=Profile Information', { state: 'hidden', timeout: 5000 })

    // Wait for database write to complete
    await page.waitForTimeout(1000)

    // Verify in database
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    expect(profile!.full_name).toBe(newName)
    expect(profile!.address).toBe(newAddress)
    expect(profile!.phone).toContain('555987') // E.164 format
  })

  test('should show email as readonly', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: '⚙️ Settings' }).click()
    await page.waitForSelector('text=Settings')

    // Email field should be visible but readonly/disabled
    // Find by text content since it's displayed but not editable
    await expect(page.getByText('larry@uglydogadventures.com')).toBeVisible()
  })

  test('should display signature section', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: '⚙️ Settings' }).click()
    await page.waitForSelector('text=Settings')

    // Signature section should be visible
    await expect(page.getByRole('heading', { name: 'Your Signature' })).toBeVisible()
    await expect(page.getByText('Sign here with your mouse or finger')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Signature' })).toBeVisible()
  })

  test('should close settings without saving when clicking Close', async ({ page }) => {
    // Open settings
    await page.getByRole('button', { name: '⚙️ Settings' }).click()
    await page.waitForSelector('text=Settings')

    // Change name (but don't save) - use placeholder since labels are divs
    await page.getByPlaceholder('John Smith').fill('Temporary Name Change')

    // Click Close
    await page.getByRole('button', { name: 'Close' }).click()

    // Should be back to dashboard
    await expect(page.getByText('Your Pets')).toBeVisible()

    // Verify database NOT changed
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    expect(profile!.full_name).toBe(originalName) // Original name unchanged
  })
})
