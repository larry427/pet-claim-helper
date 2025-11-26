require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function listPets() {
  console.log('All pets for Larry:\n')

  const { data: pets, error } = await supabase
    .from('pets')
    .select('name, insurance_company, healthy_paws_pet_id, created_at')
    .eq('user_id', LARRY_USER_ID)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (!pets || pets.length === 0) {
    console.log('No pets found')
    return
  }

  pets.forEach((pet, i) => {
    console.log((i + 1) + '. ' + pet.name)
    console.log('   Insurance: ' + pet.insurance_company)
    console.log('   HP Pet ID: ' + (pet.healthy_paws_pet_id || 'NULL'))
    console.log('   Created: ' + pet.created_at)
    console.log('')
  })
}

listPets()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
