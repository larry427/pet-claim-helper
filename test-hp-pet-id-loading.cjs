const { chromium } = require('playwright')

async function test() {
  console.log('Testing HP Pet ID loading in Edit Pet form...\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Login
    console.log('1. Logging in...')
    await page.goto('https://pet-claim-helper.vercel.app/')
    await page.fill('input[type="email"]', 'larrylevin93@gmail.com')
    await page.fill('input[type="password"]', 'Cooper!2')
    await page.click('button:has-text("Sign In")')
    await page.waitForTimeout(3000)

    // Find Trinity pet card
    console.log('2. Looking for Trinity pet card...')
    const trinityCard = page.locator('text=Trinity').first()
    await trinityCard.waitFor({ timeout: 5000 })
    console.log('   ✓ Found Trinity card')

    // Click Edit button on Trinity's card
    console.log('3. Clicking Edit button...')
    await trinityCard.locator('..').locator('button:has-text("Edit")').click()
    await page.waitForTimeout(1000)

    // Check if HP Pet ID field exists and has value
    console.log('4. Checking HP Pet ID field...')
    const hpPetIdInput = page.locator('input[value*="1400806"]').or(page.locator('label:has-text("Healthy Paws Pet ID")').locator('..').locator('input'))

    const hpPetIdValue = await hpPetIdInput.inputValue()
    console.log('   HP Pet ID field value: "' + hpPetIdValue + '"')

    if (hpPetIdValue === '1400806-3') {
      console.log('\n✅ SUCCESS - HP Pet ID is loading correctly!')
    } else if (hpPetIdValue === '') {
      console.log('\n❌ FAILED - HP Pet ID field is BLANK (not loading from database)')
    } else {
      console.log('\n⚠️  UNEXPECTED - HP Pet ID has wrong value: "' + hpPetIdValue + '"')
    }

    await page.waitForTimeout(5000)
  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
  } finally {
    await browser.close()
  }
}

test()
