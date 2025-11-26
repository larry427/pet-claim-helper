const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
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
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  try {
    console.log('Logging in...')
    await page.goto(data.properties.action_link)
    await page.waitForTimeout(5000)

    console.log('Finding Bo claim...')
    const boHeading = page.locator('text=Bo').first()
    await boHeading.waitFor({ timeout: 10000 })

    // Find Preview PDF button on first bill card
    console.log('Clicking Preview PDF button...')
    const previewButton = page.locator('button:has-text("Preview")').first()

    // Listen for download
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })

    await previewButton.click()

    console.log('Waiting for PDF download...')
    const download = await downloadPromise

    const path = 'test-bo-hp-pet-id.pdf'
    await download.saveAs(path)

    console.log('\n✅ PDF saved: ' + path)
    console.log('\nOPEN THE PDF AND CHECK:')
    console.log('- Pet Id field should show: "1400806-1"')
    console.log('- Coordinates: (355, 500)')
    console.log('')

    await page.waitForTimeout(5000)
  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
