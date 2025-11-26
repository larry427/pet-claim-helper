const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  console.log('Testing HP Pet ID on LOCALHOST...\n')

  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'larry@uglydogadventures.com',
  })

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to localhost instead of production
    const magicLink = data.properties.action_link.replace('pet-claim-helper.vercel.app', 'localhost:5173')
    console.log('Opening localhost with magic link...')

    await page.goto(magicLink)
    await page.waitForTimeout(5000)

    console.log('Looking for Trinity...')
    await page.locator('text=Trinity').first().waitFor({ timeout: 10000 })

    console.log('Clicking Edit...')
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.waitForTimeout(2000)

    console.log('Finding HP Pet ID field...')
    const hpLabel = page.locator('label:has-text("Healthy Paws Pet ID")')
    const hpPetIdInput = hpLabel.locator('+ input').or(hpLabel.locator('~ input').first())
    const value = await hpPetIdInput.inputValue()

    console.log('\n========== LOCALHOST RESULT ==========')
    console.log('Database: "1400806-3"')
    console.log('Frontend: "' + value + '"')

    if (value === '1400806-3') {
      console.log('\n✅ LOCALHOST WORKS - Code is correct!')
      console.log('   → Problem is Vercel deployment or caching')
    } else {
      console.log('\n❌ LOCALHOST ALSO BROKEN - Code has a bug')
    }
    console.log('======================================\n')

    await page.waitForTimeout(10000)
  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
