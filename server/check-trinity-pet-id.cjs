require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function checkTrinity() {
  console.log('Checking Trinity pet record...\n')
  
  const { data: pet, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, policy_number, healthy_paws_pet_id, created_at')
    .eq('user_id', LARRY_USER_ID)
    .eq('name', 'Trinity')
    .single()

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('Pet ID:', pet.id)
  console.log('Name:', pet.name)
  console.log('Insurance:', pet.insurance_company)
  console.log('Policy Number:', pet.policy_number)
  console.log('HP Pet ID:', pet.healthy_paws_pet_id || 'NULL ❌')
  console.log('Created:', pet.created_at)
  
  if (!pet.healthy_paws_pet_id) {
    console.log('\n❌ ISSUE A CONFIRMED: Pet ID is NULL in database')
    console.log('   The Add Pet form is NOT saving healthy_paws_pet_id')
  } else {
    console.log('\n✅ Pet ID exists in database')
    console.log('   ISSUE B: The fetch/display logic is broken')
  }
}

checkTrinity()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
