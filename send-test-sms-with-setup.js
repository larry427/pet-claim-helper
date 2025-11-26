import { createClient } from '@supabase/supabase-js'
import { sendTwilioSMS } from './server/utils/sendTwilioSMS.js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function sendTestSMS() {
  const testPhone = '+13123050403'

  console.log('🔍 Setting up test medication...\n')

  // First, get or create a user
  const { data: { user } } = await supabase.auth.getUser()
  let userId = user?.id

  if (!userId) {
    // If no authenticated user, find any user in the system
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single()

    userId = profiles?.id
  }

  if (!userId) {
    console.log('❌ No user found. Please ensure there is a user in the system.')
    return
  }

  console.log('👤 User ID:', userId)

  // Find or create a test pet
  let { data: pet } = await supabase
    .from('pets')
    .select('id, name')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!pet) {
    // Create a test pet
    const { data: newPet, error: petError } = await supabase
      .from('pets')
      .insert({
        user_id: userId,
        name: 'Test Dog',
        species: 'Dog',
        breed: 'Labrador'
      })
      .select()
      .single()

    if (petError) {
      console.error('❌ Error creating test pet:', petError)
      return
    }
    pet = newPet
    console.log('✅ Created test pet:', pet.name)
  } else {
    console.log('🐾 Using existing pet:', pet.name)
  }

  // Create a test medication
  const { data: medication, error: medError } = await supabase
    .from('medications')
    .insert({
      user_id: userId,
      pet_id: pet.id,
      medication_name: 'Test Medication',
      dosage: '10mg',
      frequency: '1x daily',
      start_date: new Date().toISOString().split('T')[0],
      reminder_times: ['12:00']
    })
    .select('*, pets(name)')
    .single()

  if (medError) {
    console.error('❌ Error creating medication:', medError)
    return
  }

  console.log('💊 Created test medication:', medication.medication_name)
  console.log('📋 Medication ID:', medication.id)

  const petName = medication.pets?.name || 'your pet'
  const medName = medication.medication_name
  const deepLink = `https://pet-claim-helper.vercel.app/dose/${medication.id}?action=mark`

  // Build the exact same message as the backend
  const message = `🐾 Time to give ${petName} their ${medName}! Tap to mark as given: ${deepLink} Reply HELP for help.`

  console.log('\n' + '='.repeat(60))
  console.log('📱 SENDING TEST SMS TO:', testPhone)
  console.log('='.repeat(60))
  console.log('\n📋 MESSAGE CONTENT:')
  console.log('─'.repeat(60))
  console.log(message)
  console.log('─'.repeat(60))
  console.log('\n🔗 DEEP LINK:', deepLink)
  console.log('💊 Medication ID:', medication.id)
  console.log('🐾 Pet Name:', petName)
  console.log('💊 Med Name:', medName)
  console.log('\n📤 Sending via Twilio...\n')

  // Send the SMS
  const result = await sendTwilioSMS(testPhone, message)

  if (result.success) {
    console.log('✅ SMS SENT SUCCESSFULLY!')
    console.log('Message SID:', result.messageId)
    console.log('\n' + '='.repeat(60))
    console.log('🎯 NEXT STEPS:')
    console.log('='.repeat(60))
    console.log('1. Check your phone (+13123050403)')
    console.log('2. You should receive an SMS like this:')
    console.log('   "🐾 Time to give Test Dog their Test Medication!"')
    console.log('   "Tap to mark as given: [LINK]"')
    console.log('3. Click/tap the link in the SMS')
    console.log('4. It should open the app to /dose/' + medication.id + '?action=mark')
    console.log('5. Tell me what happens!')
    console.log('='.repeat(60))
  } else {
    console.log('❌ SMS FAILED TO SEND')
    console.log('Error:', result.error)
  }

  // Clean up: delete the test medication
  console.log('\n🧹 Cleaning up test medication...')
  await supabase
    .from('medications')
    .delete()
    .eq('id', medication.id)
  console.log('✅ Test medication deleted')
}

sendTestSMS().catch(console.error)
