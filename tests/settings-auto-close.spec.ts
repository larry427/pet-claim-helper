import { test, expect } from '@playwright/test'

test.describe('Settings Modal Auto-Close Fix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('Settings modal should auto-close after saving profile', async ({ page }) => {
    // Login first
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    await emailInput.fill('larry@uglydogadventures.com')
    await passwordInput.fill('Bowie1!')

    const loginButton = page.getByRole('button', { name: /log in/i })
    await loginButton.click()

    // Wait for app to load
    await page.waitForTimeout(2000)

    // Click Settings button
    const settingsButton = page.getByRole('button', { name: /settings/i }).first()
    await settingsButton.click()

    // Wait for Settings view to appear
    await page.waitForTimeout(1000)
    await expect(page.getByText('Settings', { exact: true })).toBeVisible()

    // Find and modify phone number
    const phoneInput = page.locator('input').filter({ hasText: /phone/i }).or(
      page.locator('label:has-text("Phone")').locator('..').locator('input')
    ).first()

    if (await phoneInput.count() === 0) {
      // Try alternative selector
      const allInputs = await page.locator('input').all()
      for (const input of allInputs) {
        const label = await input.evaluate((el) => {
          const parent = el.parentElement
          const labelEl = parent?.querySelector('label')
          return labelEl?.textContent || ''
        })
        if (label.toLowerCase().includes('phone')) {
          await input.clear()
          await input.fill('555-TEST-123')
          break
        }
      }
    } else {
      await phoneInput.clear()
      await phoneInput.fill('555-TEST-123')
    }

    // Click Save Profile
    const saveButton = page.getByRole('button', { name: /save profile/i })
    await saveButton.click()

    // Wait for alert and handle it
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Profile saved')
      await dialog.accept()
    })

    // Wait a bit for dialog to be handled
    await page.waitForTimeout(1000)

    // Settings view should now be closed (Settings heading should not be visible)
    // We should be back at the main app view
    const settingsHeading = page.getByText('Settings', { exact: true })
    await expect(settingsHeading).not.toBeVisible({ timeout: 3000 })

    console.log('✅ Settings modal auto-closed after saving profile!')
  })
})
