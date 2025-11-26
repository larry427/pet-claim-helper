require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function check() {
  const { data, error } = await supabase
    .from('pets')
    .select('name, healthy_paws_pet_id, updated_at')
    .eq('user_id', LARRY_USER_ID)
    .eq('name', 'Bo')
    .single()

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('\n========== BO DATABASE VALUES ==========')
  console.log('Name: ' + data.name)
  console.log('HP Pet ID: ' + (data.healthy_paws_pet_id || 'NULL'))
  console.log('Last Updated: ' + data.updated_at)
  console.log('========================================\n')
}

check()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
