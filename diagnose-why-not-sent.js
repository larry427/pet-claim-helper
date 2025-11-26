import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'
import { sendTwilioSMS } from './server/utils/sendTwilioSMS.js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnose() {
  console.log('🔍 DIAGNOSING WHY SMS NOT SENT')
  console.log('='.repeat(80))

  // Test 1: Check Twilio credentials
  console.log('\n📋 TEST 1: TWILIO CREDENTIALS')
  console.log('-'.repeat(80))
  console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.slice(0, 10)}...` : '❌ MISSING')
  console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'SET ✅' : '❌ MISSING')
  console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER || '❌ MISSING')

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('\n🚨 CRITICAL: Twilio credentials are MISSING!')
    console.log('This would cause sendTwilioSMS to fail silently.')
    console.log('The cron would mark as "SMS send failed"')
  }

  // Test 2: Try to send a test SMS
  console.log('\n\n📋 TEST 2: SEND TEST SMS')
  console.log('-'.repeat(80))
  console.log('Attempting to send test SMS to +13123050403...')

  const testResult = await sendTwilioSMS('+13123050403', 'TEST: Medication reminder system check')

  if (testResult.success) {
    console.log('✅ SMS SENT SUCCESSFULLY!')
    console.log('Message SID:', testResult.messageId)
    console.log('\n✅ Twilio is working correctly.')
  } else {
    console.log('❌ SMS FAILED TO SEND')
    console.log('Error:', testResult.error)
    console.log('\n🚨 THIS IS THE PROBLEM!')
    console.log('Twilio is not configured correctly.')
    console.log('This is why UI-created medications don\'t send SMS.')
  }

  // Test 3: Check if cron endpoint is configured on Render
  console.log('\n\n📋 TEST 3: RENDER CRON CONFIGURATION')
  console.log('-'.repeat(80))
  console.log('The Render cron job should be configured to run:')
  console.log('  Schedule: */1 * * * * (every minute)')
  console.log('  OR: * * * * * (every minute)')
  console.log('  Command: curl https://pet-claim-helper.onrender.com/api/cron/send-medication-reminders')
  console.log('\nIf the cron is NOT running every minute, medications will be skipped.')

  // Test 4: Simulate the exact cron logic for UI_TEST_21:16
  console.log('\n\n📋 TEST 4: SIMULATE CRON FOR UI_TEST_21:16')
  console.log('-'.repeat(80))

  const { data: testMed, error: medError } = await supabase
    .from('medications')
    .select('*, pets(name), profiles(phone, sms_opt_in)')
    .eq('medication_name', 'UI_TEST_21:16')
    .single()

  if (medError || !testMed) {
    console.log('❌ Medication not found')
  } else {
    console.log('Medication found:')
    console.log('  Name:', testMed.medication_name)
    console.log('  reminder_times:', testMed.reminder_times)
    console.log('  start_date:', testMed.start_date)
    console.log('  end_date:', testMed.end_date)
    console.log('  phone:', testMed.profiles?.phone)
    console.log('  sms_opt_in:', testMed.profiles?.sms_opt_in)

    // Simulate at 21:16
    const simulatedTime = '21:16'
    const [simHour, simMin] = simulatedTime.split(':')
    const reminderTimes = testMed.reminder_times || []
    const shouldSend = reminderTimes.some(time => {
      const [hour, minute] = time.split(':')
      return hour === simHour && minute === simMin
    })

    console.log('\nSimulating cron at 21:16:')
    console.log('  Should send?', shouldSend ? '✅ YES' : '❌ NO')

    if (!shouldSend) {
      console.log('  ⚠️  Time matching failed! This is the bug.')
    } else {
      console.log('  ✅ Time matching works correctly.')
      console.log('\nSo the cron SHOULD have sent SMS at 21:16.')
      console.log('Possible reasons it didn\'t:')
      console.log('  1. Cron didn\'t run at 21:16 (check Render logs)')
      console.log('  2. Twilio credentials missing (see TEST 2)')
      console.log('  3. SMS send failed silently')
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 DIAGNOSIS COMPLETE')
  console.log('='.repeat(80))
}

diagnose().catch(console.error)
