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

  // Capture console logs
  page.on('console', msg => {
    const text = msg.text()
    if (text.includes('[dbLoadPets]') || text.includes('healthy_paws')) {
      console.log('CONSOLE:', text)
    }
  })

  try {
    await page.goto(data.properties.action_link)
    await page.waitForTimeout(5000)

    console.log('\nWaiting to see [dbLoadPets] console logs...\n')
    await page.waitForTimeout(3000)

    console.log('\nNow opening Edit modal to see if healthy_paws_pet_id is in the loaded data...\n')
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.waitForTimeout(5000)

  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
