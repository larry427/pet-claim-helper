require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function showRemainingData() {
  console.log('Showing remaining data for larry@uglydogadventures.com...\n')

  // Check pets
  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', LARRY_USER_ID)
    .order('created_at', { ascending: false })

  console.log('=== PETS ===')
  if (pets && pets.length > 0) {
    pets.forEach(pet => {
      console.log(`- ${pet.name} (${pet.species})`)
      console.log(`  Insurance: ${pet.insurance_company || 'None'}`)
      console.log(`  Created: ${pet.created_at}`)
      console.log(`  ID: ${pet.id}`)
      console.log('')
    })
  } else {
    console.log('No pets found\n')
  }

  // Check claims
  const { data: claims } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', LARRY_USER_ID)
    .order('created_at', { ascending: false })

  console.log('=== CLAIMS ===')
  if (claims && claims.length > 0) {
    claims.forEach(claim => {
      console.log(`- ${claim.visit_title || 'Untitled'}`)
      console.log(`  Service Date: ${claim.service_date}`)
      console.log(`  Amount: $${claim.total_amount}`)
      console.log(`  Created: ${claim.created_at}`)
      console.log(`  ID: ${claim.id}`)
      console.log('')
    })
  } else {
    console.log('No claims found\n')
  }

  // Check medications
  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', LARRY_USER_ID)
    .order('created_at', { ascending: false })

  console.log('=== MEDICATIONS ===')
  if (medications && medications.length > 0) {
    medications.forEach(med => {
      console.log(`- ${med.medication_name}`)
      console.log(`  Pet: ${med.pet_name}`)
      console.log(`  Created: ${med.created_at}`)
      console.log('')
    })
  } else {
    console.log('No medications found\n')
  }
}

showRemainingData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
