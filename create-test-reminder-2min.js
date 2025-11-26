import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function createTestReminder() {
  console.log('🧪 CREATING TEST MEDICATION FOR IMMEDIATE SMS TEST')
  console.log('='.repeat(80))

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const twoMinutesFromNow = nowPST.plus({ minutes: 2 })
  const testTime = twoMinutesFromNow.toFormat('HH:mm')
  const todayPST = nowPST.toISODate()

  console.log('Current PST time:', nowPST.toFormat('HH:mm'))
  console.log('Test reminder time:', testTime)
  console.log('Start date:', todayPST)

  // Get user ID from existing testsmsmeds medication
  const { data: existingMed } = await supabase
    .from('medications')
    .select('user_id, pet_id, pets(name)')
    .eq('medication_name', 'testsmsmeds')
    .single()

  if (!existingMed) {
    console.error('❌ No existing medication found to get user_id from')
    return
  }

  const userId = existingMed.user_id
  const petIdToUse = existingMed.pet_id
  const petName = existingMed.pets?.name || 'Unknown'

  console.log('User ID:', userId)
  console.log('Pet:', petName, '(', petIdToUse, ')')

  // Create test medication
  const { data: medication, error: medError } = await supabase
    .from('medications')
    .insert({
      user_id: userId,
      pet_id: petIdToUse,
      medication_name: 'TEST_SMS_' + testTime,
      dosage: '1 pill',
      frequency: '1x daily',
      reminder_times: [testTime],
      start_date: todayPST,
      end_date: todayPST,
    })
    .select()
    .single()

  if (medError) {
    console.error('❌ Error creating medication:', medError)
    return
  }

  console.log('\n✅ TEST MEDICATION CREATED!')
  console.log('='.repeat(80))
  console.log('📋 Medication ID:', medication.id)
  console.log('💊 Name:', medication.medication_name)
  console.log('⏰ Reminder time:', testTime, 'PST')
  console.log('📅 Start/End date:', todayPST)
  console.log('📱 Phone:', '+13123050403')
  console.log('\n⏳ WAITING FOR SMS...')
  console.log('SMS should be sent at:', twoMinutesFromNow.toFormat('HH:mm:ss'))
  console.log('\n🔍 TO MONITOR:')
  console.log('1. Watch Render logs for medication-reminders cron job')
  console.log('2. Check your phone for SMS')
  console.log('3. Click the deep link to test the UI')
  console.log('\n💡 The cron job runs every minute, so the SMS will arrive within')
  console.log('   1-2 minutes after the scheduled time.')
  console.log('='.repeat(80))
}

createTestReminder().catch(console.error)
