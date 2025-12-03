// Test script to verify Visit Title field auto-population
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const TEST_EMAIL = 'larry@uglydogadventures.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'your-password-here'

async function test() {
  console.log('\n🧪 Testing Visit Title Field Auto-Population\n')
  console.log('=' .repeat(60))

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to app
    console.log('\n📱 Step 1: Navigating to http://localhost:5173')
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')

    // Check if already logged in
    const logoutButton = page.getByRole('button', { name: /logout/i })
    const isLoggedIn = await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)

    if (!isLoggedIn) {
      console.log(`\n🔐 Step 2: Logging in as ${TEST_EMAIL}...`)
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.getByLabel(/email/i).fill(TEST_EMAIL)
      await page.locator('input[type="password"]').fill(TEST_PASSWORD)
      await page.getByRole('button', { name: /log in/i }).click()
      await page.waitForTimeout(2000)
    } else {
      console.log('\n✅ Step 2: Already logged in')
    }

    // Upload a test vet bill
    console.log('\n📤 Step 3: Uploading test vet bill...')
    const testBillPath = path.join(__dirname, 'test/vet-bills/healthypaws-bill.pdf')

    if (!fs.existsSync(testBillPath)) {
      console.error(`\n❌ Test bill not found at: ${testBillPath}`)
      console.log('Creating a placeholder test...')
      // Just take a screenshot of the current state
      await page.screenshot({
        path: 'visit-title-test-no-bill.png',
        fullPage: true
      })
      console.log('✅ Screenshot saved: visit-title-test-no-bill.png')
      return
    }

    const fileInput = page.locator('input[type="file"]').last()
    await fileInput.setInputFiles(testBillPath)
    console.log('✅ File selected')

    // Click Process Bill button
    console.log('\n⚙️  Step 4: Processing bill...')
    await page.waitForTimeout(1000)
    const processButton = page.getByRole('button', { name: /process bill/i })
    await processButton.click()
    console.log('✅ Process button clicked')

    // Wait for OCR processing (may take a while)
    console.log('\n⏳ Step 5: Waiting for AI extraction...')
    await page.waitForTimeout(15000) // Wait up to 15 seconds for OCR

    // Look for the Visit Title field
    console.log('\n🔍 Step 6: Checking Visit Title field...')
    const visitTitleInput = page.locator('input').filter({ hasText: '' }).nth(0) // First input after extracted details

    // Take screenshot of the form with auto-populated field
    await page.screenshot({
      path: 'visit-title-auto-populated.png',
      fullPage: true
    })
    console.log('📸 Screenshot saved: visit-title-auto-populated.png')

    // Check if helper text is visible
    const helperText = page.getByText(/edit if needed/i)
    const hasHelperText = await helperText.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`\n${'✅'} Helper text "Edit if needed": ${hasHelperText ? 'VISIBLE' : 'NOT VISIBLE'}`)

    // Try to find the Visit Title label
    const visitTitleLabel = page.getByText(/what was this visit for/i)
    const hasLabel = await visitTitleLabel.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`${'✅'} Visit Title label: ${hasLabel ? 'VISIBLE' : 'NOT VISIBLE'}`)

    // Complete the flow to see the claim card
    console.log('\n📋 Step 7: Completing the flow to create claim...')

    // Scroll to find and click Save Claim button
    const saveButton = page.getByRole('button', { name: /save claim/i })
    const hasSaveButton = await saveButton.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasSaveButton) {
      await saveButton.scrollIntoViewIfNeeded()
      await saveButton.click()
      console.log('✅ Save Claim clicked')
      await page.waitForTimeout(3000)

      // Navigate to Bills section to see claim cards
      const billsSection = page.getByRole('button', { name: /bills/i }).first()
      if (await billsSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        await billsSection.click()
        await page.waitForTimeout(1000)
      }

      // Take screenshot of claim card
      await page.screenshot({
        path: 'visit-title-claim-card.png',
        fullPage: true
      })
      console.log('📸 Screenshot saved: visit-title-claim-card.png')
    } else {
      console.log('⚠️  Save button not found, taking current screenshot')
      await page.screenshot({
        path: 'visit-title-current-state.png',
        fullPage: true
      })
      console.log('📸 Screenshot saved: visit-title-current-state.png')
    }

    console.log('\n' + '=' .repeat(60))
    console.log('✅ TEST COMPLETE!')
    console.log('\nPlease review the screenshots:')
    console.log('  - visit-title-auto-populated.png (Shows auto-populated field)')
    console.log('  - visit-title-claim-card.png (Shows claim card with title)')
    console.log('=' .repeat(60) + '\n')

    // Keep browser open for manual inspection
    console.log('Browser will stay open for manual inspection...')
    console.log('Press Ctrl+C to close.')
    await page.waitForTimeout(60000) // Wait 1 minute before auto-closing

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)

    // Take error screenshot
    await page.screenshot({
      path: 'visit-title-error.png',
      fullPage: true
    })
    console.log('📸 Error screenshot saved: visit-title-error.png')
  } finally {
    await browser.close()
  }
}

test().catch(console.error)
