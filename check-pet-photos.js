import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ORIGINAL_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // larry@uglydogadventures.com
const NEW_USER_ID = 'ca846c5c-625f-4e29-9237-e58f16aec5d0' // larrysecrets@gmail.com

async function checkPhotos() {
  console.log('='.repeat(80))
  console.log('CHECKING PET PHOTOS')
  console.log('='.repeat(80))
  console.log('')

  // Check original pets
  console.log('[ORIGINAL ACCOUNT] larry@uglydogadventures.com')
  console.log(''.repeat(80))

  const { data: originalPets, error: origError } = await supabase
    .from('pets')
    .select('id, name, photo_url')
    .eq('user_id', ORIGINAL_USER_ID)
    .order('created_at')

  if (origError) {
    console.error('Error:', origError)
  } else {
    console.log(`Total pets: ${originalPets.length}\n`)
    originalPets.forEach((pet, idx) => {
      console.log(`${idx + 1}. ${pet.name}`)
      console.log(`   Photo URL: ${pet.photo_url || 'NO PHOTO'}`)
      console.log('')
    })
  }

  console.log(''.repeat(80))
  console.log('[NEW ACCOUNT] larrysecrets@gmail.com')
  console.log(''.repeat(80))

  const { data: newPets, error: newError } = await supabase
    .from('pets')
    .select('id, name, photo_url')
    .eq('user_id', NEW_USER_ID)
    .order('created_at')

  if (newError) {
    console.error('Error:', newError)
  } else {
    console.log(`Total pets: ${newPets.length}\n`)
    let withPhotos = 0
    let withoutPhotos = 0

    newPets.forEach((pet, idx) => {
      const hasPhoto = pet.photo_url && pet.photo_url.trim() !== ''
      if (hasPhoto) withPhotos++
      else withoutPhotos++

      console.log(`${idx + 1}. ${pet.name}`)
      console.log(`   Photo URL: ${pet.photo_url || 'NO PHOTO'}`)
      console.log(`   Status: ${hasPhoto ? '✅ HAS PHOTO' : '❌ NO PHOTO'}`)
      console.log('')
    })

    console.log('='.repeat(80))
    console.log('SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total pets: ${newPets.length}`)
    console.log(`With photos: ${withPhotos}`)
    console.log(`Without photos: ${withoutPhotos}`)
    console.log('')

    if (withoutPhotos > 0) {
      console.log('⚠️  Some pets are missing photos!')
    } else {
      console.log('✅ All pets have photos!')
    }
  }
}

checkPhotos().catch(console.error)
