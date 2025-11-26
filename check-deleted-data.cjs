require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function checkDeletedData() {
  console.log('Checking what was deleted from larry@uglydogadventures.com...\n')

  // Check current state
  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', LARRY_USER_ID)

  const { data: claims } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', LARRY_USER_ID)

  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', LARRY_USER_ID)

  console.log('Current state:')
  console.log(`- Pets: ${pets?.length || 0}`)
  console.log(`- Claims: ${claims?.length || 0}`)
  console.log(`- Medications: ${medications?.length || 0}`)
  console.log('')

  if (pets?.length === 0 && claims?.length === 0 && medications?.length === 0) {
    console.log('❌ CONFIRMED: All data was deleted by test cleanup')
    console.log('')
    console.log('RECOVERY OPTIONS:')
    console.log('1. Check Supabase dashboard for point-in-time recovery')
    console.log('2. Check if you have database backups')
    console.log('3. Restore from any local backups or exports')
  }
}

checkDeletedData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
