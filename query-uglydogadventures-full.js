import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function queryFullAccount() {
  const userId = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

  console.log('[Full Account Query] larry@uglydogadventures.com')
  console.log('User ID:', userId)
  console.log('\n')

  // 1. Profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (profileError) {
    console.error('Profile Error:', profileError)
  } else {
    console.log('=== PROFILE ===')
    console.log(JSON.stringify(profile, null, 2))
    console.log('\n')
  }

  // 2. Pets
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)

  if (petsError) {
    console.error('Pets Error:', petsError)
  } else {
    console.log(`=== PETS (${pets.length}) ===`)
    console.log(JSON.stringify(pets, null, 2))
    console.log('\n')
  }

  // 3. Claims (won't copy, but good to see)
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)

  if (claimsError) {
    console.error('Claims Error:', claimsError)
  } else {
    console.log(`=== CLAIMS (${claims.length}) - WILL NOT BE COPIED ===`)
    console.log(JSON.stringify(claims, null, 2))
    console.log('\n')
  }

  // 4. Medications (won't copy)
  const { data: medications, error: medicationsError } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)

  if (medicationsError) {
    console.error('Medications Error:', medicationsError)
  } else {
    console.log(`=== MEDICATIONS (${medications.length}) - WILL NOT BE COPIED ===`)
    console.log(JSON.stringify(medications, null, 2))
    console.log('\n')
  }

  console.log('[Full Account Query] Done')
}

queryFullAccount().catch(console.error)
