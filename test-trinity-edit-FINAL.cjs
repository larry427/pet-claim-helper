const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'larry@uglydogadventures.com',
  })

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(data.properties.action_link)
    await page.waitForTimeout(5000)

    console.log('Finding Trinity pet card...')

    // Find Trinity's card specifically by looking for the heading with her name
    const trinityHeading = page.locator('h3:has-text("Trinity")')
    await trinityHeading.waitFor({ timeout: 10000 })
    console.log('✓ Found Trinity heading')

    // Find the Edit button within Trinity's card (nearest ancestor)
    const trinityCard = trinityHeading.locator('xpath=ancestor::div[@class][1]')
    const editButton = trinityCard.getByRole('button', { name: 'Edit' })

    console.log('Clicking Edit button for Trinity...')
    await editButton.click()
    await page.waitForTimeout(2000)

    // Find HP Pet ID input
    const hpLabel = page.locator('label:has-text("Healthy Paws Pet ID")')
    const hpPetIdInput = hpLabel.locator('+ input').or(hpLabel.locator('~ input').first())
    const value = await hpPetIdInput.inputValue()

    console.log('\n========== FINAL TEST RESULT ==========')
    console.log('Database (Trinity): "1400806-3"')
    console.log('Frontend value: "' + value + '"')

    if (value === '1400806-3') {
      console.log('\n✅ SUCCESS - HP Pet ID is loading correctly for Trinity!')
      console.log('The fix IS working!')
    } else {
      console.log('\n❌ FAILED - Loaded wrong value or blank')
      console.log('Expected: 1400806-3')
      console.log('Got: ' + (value || '(empty)'))
    }
    console.log('=======================================\n')

    await page.waitForTimeout(10000)
  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
