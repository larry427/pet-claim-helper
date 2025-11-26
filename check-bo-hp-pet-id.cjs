require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function checkBo() {
  console.log('Checking Bo (Healthy Paws pet)...')
  
  const { data: pet, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, policy_number, healthy_paws_pet_id')
    .eq('user_id', LARRY_USER_ID)
    .eq('name', 'Bo')
    .single()

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('Pet:', pet.name)
  console.log('Insurance:', pet.insurance_company)
  console.log('Policy Number:', pet.policy_number)
  console.log('HP Pet ID:', pet.healthy_paws_pet_id || 'NULL (NOT SET)')
  
  if (!pet.healthy_paws_pet_id) {
    console.log('\n⚠️  HP Pet ID is NULL - it needs to be entered in the app!')
  }
}

checkBo()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
