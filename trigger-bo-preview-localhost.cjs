const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  console.log('Triggering Bo PDF preview on localhost...\n')

  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'larry@uglydogadventures.com',
  })

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const magicLink = data.properties.action_link.replace('pet-claim-helper.vercel.app', 'localhost:5173')

    await page.goto(magicLink)
    await page.waitForTimeout(5000)

    console.log('Looking for Bo bill card...')
    const boText = page.locator('text=Bo').first()
    await boText.waitFor({ timeout: 10000 })

    console.log('Finding Preview button...')
    // Find the first "Preview Claim Form PDF" button
    const previewButton = page.locator('button:has-text("Preview")').first()

    console.log('Clicking Preview button - check server logs for [PDF Generation] output...\n')
    await previewButton.click()

    console.log('Waiting 10 seconds for PDF to generate and open in new tab...')
    await page.waitForTimeout(10000)

    console.log('\n✅ Preview triggered')
    console.log('\nNOW CHECK:')
    console.log('1. Terminal running "npm run dev" for log: [PDF Generation] healthyPawsPetId received: ...')
    console.log('2. The opened PDF tab to see if Pet Id field shows "1400806-1"')
  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
