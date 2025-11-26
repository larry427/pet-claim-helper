const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createMagicLink() {
  // Use Larry's email
  const email = 'larry@uglydogadventures.com'
  
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: email,
  })
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('\n🔑 MAGIC LINK FOR TESTING:')
  console.log(data.properties.action_link)
  console.log('\n✅ Click this link to sign in as', email)
}

createMagicLink()
