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
    const trinityText = page.locator('text=Trinity').first()
    await trinityText.waitFor({ timeout: 10000 })
    console.log('   ✓ Found Trinity\n')

    // Click Edit button (find it near Trinity)
    console.log('Step 4: Clicking Edit button...')
    const editButtons = page.getByRole('button', { name: 'Edit' })
    await editButtons.first().click()
    await page.waitForTimeout(2000)

    // Find HP Pet ID input by placeholder or nearby label
    console.log('Step 5: Finding HP Pet ID input field...')

    // Try multiple ways to find it
    let hpPetIdInput

    // Method 1: By placeholder
    hpPetIdInput = page.locator('input[placeholder*="Pet ID"]')
    const count1 = await hpPetIdInput.count()
    console.log('   Inputs with "Pet ID" placeholder: ' + count1)

    // Method 2: Find input after "Healthy Paws Pet ID" label
    const hpLabel = page.locator('label:has-text("Healthy Paws Pet ID")')
    const labelCount = await hpLabel.count()
    console.log('   Labels with "Healthy Paws Pet ID": ' + labelCount)

    if (labelCount > 0) {
      // Get the input that follows this label
      hpPetIdInput = hpLabel.locator('+ input').or(hpLabel.locator('~ input').first())
    }

    const value = await hpPetIdInput.inputValue()

    console.log('\n========== RESULT ==========')
    console.log('Database value: "1400806-3"')
    console.log('Frontend value: "' + value + '"')

    if (value === '1400806-3') {
      console.log('\n✅ SUCCESS - HP Pet ID is loading correctly!')
    } else if (value === '' || !value) {
      console.log('\n❌ FAILED - HP Pet ID field is BLANK or undefined')
      console.log('   → Frontend is NOT loading the value from database')
      console.log('   → The fix is NOT working')
    } else {
      console.log('\n⚠️  Loaded wrong value')
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
