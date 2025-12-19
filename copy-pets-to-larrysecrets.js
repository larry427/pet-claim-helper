import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ORIGINAL_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // larry@uglydogadventures.com
const NEW_USER_ID = 'ca846c5c-625f-4e29-9237-e58f16aec5d0' // larrysecrets@gmail.com

async function copyPets() {
  console.log('='.repeat(80))
  console.log('COPYING PETS TO larrysecrets@gmail.com')
  console.log('='.repeat(80))
  console.log('')

  try {
    // Get original pets
    console.log('[STEP 1] Fetching pets from larry@uglydogadventures.com...')
    const { data: originalPets, error: fetchError } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', ORIGINAL_USER_ID)
      .order('created_at')

    if (fetchError) {
      throw fetchError
    }

    console.log(`✅ Found ${originalPets.length} pets to copy\n`)

    // Copy each pet
    console.log('[STEP 2] Copying pets...')
    for (const pet of originalPets) {
      const newPetData = {
        user_id: NEW_USER_ID,
        name: pet.name,
        species: pet.species,
        color: pet.color,
        photo_url: pet.photo_url,
        insurance_company: pet.insurance_company,
        policy_number: pet.policy_number,
        owner_name: pet.owner_name,
        owner_address: pet.owner_address,
        owner_phone: pet.owner_phone,
        filing_deadline_days: pet.filing_deadline_days
      }

      const { data: newPet, error: insertError } = await supabase
        .from('pets')
        .insert(newPetData)
        .select()
        .single()

      if (insertError) {
        console.error(`❌ Error copying pet "${pet.name}":`, insertError)
        throw insertError
      }

      console.log(`   ✅ ${pet.name} (${pet.species})`)
      console.log(`      Insurance: ${pet.insurance_company || 'None'}`)
      console.log(`      Policy: ${pet.policy_number || 'None'}`)
    }

    console.log(`\n✅ All ${originalPets.length} pets copied successfully!`)

    // Verify
    console.log('\n[VERIFICATION]')
    const { data: newPets } = await supabase
      .from('pets')
      .select('id, name, insurance_company, policy_number')
      .eq('user_id', NEW_USER_ID)

    console.log(`Total pets for larrysecrets@gmail.com: ${newPets.length}`)
    newPets.forEach(p => {
      console.log(`  - ${p.name}`)
      console.log(`    Insurance: ${p.insurance_company || 'None'}`)
      console.log(`    Policy: ${p.policy_number || 'None'}`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('✅ PET COPY COMPLETE!')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ ERROR:', error)
    process.exit(1)
  }
}

copyPets().catch(console.error)
