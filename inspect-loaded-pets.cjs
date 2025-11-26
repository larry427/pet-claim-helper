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

    console.log('Inspecting pets loaded in React state...\n')

    // Execute JS in browser to inspect the pets array
    const petsData = await page.evaluate(() => {
      // Find React root and access pets state
      // This is a hack but works for debugging
      const rootElement = document.querySelector('#root')
      if (!rootElement) return null

      // Try to access React internals (this may not work reliably)
      return 'Unable to access React state directly - need to use console.log in source code'
    })

    console.log('Result:', petsData)

    // Alternative: check localStorage or sessionStorage
    const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage))
    console.log('\nLocalStorage:', localStorage)

    await page.waitForTimeout(3000)
  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await browser.close()
  }
}

test()
