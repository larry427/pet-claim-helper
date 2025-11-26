import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestMagicLink() {
  console.log('🧪 CREATING TEST MEDICATION WITH MAGIC LINK')
  console.log('='.repeat(80))

  // Get first pet
  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .limit(1)
    .single()

  if (!pets) {
    console.log('❌ No pets found. Create a pet first.')
    return
  }

  console.log('✅ Found pet:', pets.name)
  console.log('Pet ID:', pets.id)
  console.log('User ID:', pets.user_id)

  // Create test medication
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const today = nowPST.toFormat('yyyy-MM-dd')

  const { data: medication, error: medError } = await supabase
    .from('medications')
    .insert({
      user_id: pets.user_id,
      pet_id: pets.id,
      medication_name: 'Magic Link Test Med',
      dosage: '1 tablet',
      frequency: '1x daily',
      reminder_times: ['12:00'],
      start_date: today,
      end_date: null
    })
    .select()
    .single()

  if (medError) {
    console.log('❌ Error creating medication:', medError.message)
    return
  }

  console.log('✅ Medication created:', medication.id)

  // Create dose with one-time token
  const crypto = await import('crypto')
  const oneTimeToken = crypto.randomUUID()
  const tokenExpiresAt = nowPST.plus({ hours: 24 }).toISO()
  const scheduledTime = nowPST.toISO()

  const { data: dose, error: doseError } = await supabase
    .from('medication_doses')
    .insert({
      medication_id: medication.id,
      user_id: pets.user_id,
      scheduled_time: scheduledTime,
      status: 'pending',
      one_time_token: oneTimeToken,
      token_expires_at: tokenExpiresAt
    })
    .select()
    .single()

  if (doseError) {
    console.log('❌ Error creating dose:', doseError.message)
    return
  }

  console.log('✅ Dose created:', dose.id)
  console.log('Token:', oneTimeToken)
  console.log('Expires at:', tokenExpiresAt)

  // Build magic link URL
  const magicLinkUrl = `https://pet-claim-helper.vercel.app/dose/${medication.id}?token=${oneTimeToken}`

  console.log('\n' + '='.repeat(80))
  console.log('🔗 MAGIC LINK URL:')
  console.log(magicLinkUrl)
  console.log('='.repeat(80))
  console.log('\n✅ Test data created successfully!')
  console.log('\nExpected behavior:')
  console.log('  - Modal should show pet name:', pets.name)
  console.log('  - Modal should show medication:', 'Magic Link Test Med')
  console.log('  - Modal should show dosage:', '1 tablet')
  console.log('  - Should work WITHOUT requiring login')

  return {
    url: magicLinkUrl,
    petName: pets.name,
    medicationName: 'Magic Link Test Med',
    dosage: '1 tablet',
    token: oneTimeToken
  }
}

createTestMagicLink()
  .then(data => {
    if (data) {
      console.log('\n✅ Ready to test in browser!')
      process.exit(0)
    }
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
