import { createClient } from '@supabase/supabase-js'
import { sendTwilioSMS } from './server/utils/sendTwilioSMS.js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function sendTestSMS() {
  const testPhone = '+13123050403'

  console.log('🔍 Finding an existing medication or creating a test one...\n')

  // Try to find an existing medication
  const { data: medications, error: medsError } = await supabase
    .from('medications')
    .select('*, pets(name)')
    .limit(1)
    .single()

  if (medsError && medsError.code !== 'PGRST116') {
    console.error('Error fetching medications:', medsError)
    return
  }

  let medication = medications

  // If no medication exists, show available ones
  if (!medication) {
    console.log('No medications found. Let me check what exists...')
    const { data: allMeds } = await supabase
      .from('medications')
      .select('id, medication_name, pets(name)')
      .limit(5)

    console.log('Available medications:', allMeds)
    if (allMeds && allMeds.length > 0) {
      medication = allMeds[0]
    } else {
      console.log('❌ No medications found in database. Please create one first.')
      return
    }
  }

  const petName = medication.pets?.name || 'your pet'
  const medName = medication.medication_name || 'medication'
  const deepLink = `https://pet-claim-helper.vercel.app/dose/${medication.id}?action=mark`

  // Build the exact same message as the backend
  const message = `🐾 Time to give ${petName} their ${medName}! Tap to mark as given: ${deepLink} Reply HELP for help.`

  console.log('📱 SENDING TEST SMS TO:', testPhone)
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
    console.log('\n🎯 NOW:')
    console.log('1. Check your phone (+13123050403)')
    console.log('2. Click the link in the SMS')
    console.log('3. Report back what happens!')
  } else {
    console.log('❌ SMS FAILED TO SEND')
    console.log('Error:', result.error)
  }
}

sendTestSMS().catch(console.error)
