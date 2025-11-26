const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  console.log('Step 1: Generating magic link...')
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'larry@uglydogadventures.com',
  })

  if (error) {
    console.error('Error generating magic link:', error)
    return
  }

  const magicLink = data.properties.action_link
  console.log('Step 2: Opening browser with magic link...\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to magic link
    await page.goto(magicLink)
    await page.waitForTimeout(3000)

    console.log('Step 3: Looking for Trinity pet card...')
    const trinityCard = page.locator('div').filter({ hasText: /^Trinity$/i })
    await trinityCard.first().waitFor({ timeout: 10000 })
    console.log('   ✓ Found Trinity card\n')

    // Click Edit button
    console.log('Step 4: Clicking Edit button on Trinity...')
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.waitForTimeout(1500)

    // Find HP Pet ID input
    console.log('Step 5: Checking HP Pet ID field value...')
    const hpPetIdLabel = page.locator('label:has-text("Healthy Paws Pet ID")')
    await hpPetIdLabel.waitFor({ timeout: 5000 })

    const hpPetIdInput = page.locator('input').nth(4) // Assuming it's the 5th input
    const value = await hpPetIdInput.inputValue()

    console.log('\n========== RESULT ==========')
    console.log('HP Pet ID field value: "' + value + '"')
    console.log('Expected value: "1400806-3"')

    if (value === '1400806-3') {
      console.log('\n✅ SUCCESS - HP Pet ID is loading correctly!')
    } else if (value === '') {
      console.log('\n❌ FAILED - HP Pet ID field is BLANK')
      console.log('   Database has: 1400806-3')
      console.log('   Frontend loaded: (empty)')
      console.log('   → Frontend is NOT loading the value from database')
    } else {
      console.log('\n⚠️  Wrong value loaded: "' + value + '"')
    }
    console.log('============================\n')

    await page.waitForTimeout(10000)
  } catch (err) {
    console.error('\n❌ ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
