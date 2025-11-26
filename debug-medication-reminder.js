import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugMedicationReminder() {
  console.log('🔍 MEDICATION REMINDER DEBUG')
  console.log('='.repeat(80))

  // Get current PST time
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const currentHour = nowPST.hour
  const currentMinute = nowPST.minute
  const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

  console.log('\n📅 CURRENT TIME INFO:')
  console.log('Current PST time:', nowPST.toISO())
  console.log('Current PST hour:minute:', currentTime)
  console.log('Current PST date:', nowPST.toISODate())

  // Query the specific medication
  console.log('\n💊 QUERYING testsmsmeds MEDICATION:')
  console.log('-'.repeat(80))

  const { data: med, error: medError } = await supabase
    .from('medications')
    .select('*, pets(name), profiles(phone, email, sms_opt_in, timezone)')
    .eq('medication_name', 'testsmsmeds')
    .single()

  if (medError) {
    console.error('❌ Error fetching medication:', medError)
    return
  }

  if (!med) {
    console.log('❌ No medication found with name "testsmsmeds"')
    return
  }

  console.log('\n📋 MEDICATION RECORD:')
  console.log(JSON.stringify(med, null, 2))

  console.log('\n⏰ REMINDER TIMES ANALYSIS:')
  console.log('reminder_times field:', med.reminder_times)
  console.log('Type:', Array.isArray(med.reminder_times) ? 'Array' : typeof med.reminder_times)
  if (Array.isArray(med.reminder_times)) {
    console.log('Values:', med.reminder_times.join(', '))
  }

  console.log('\n📅 DATE RANGE CHECK:')
  const today = nowPST.toISODate()
  console.log('Today (PST):', today)
  console.log('Medication start_date:', med.start_date)
  console.log('Medication end_date:', med.end_date)
  console.log('Is within range?', med.start_date <= today && (!med.end_date || med.end_date >= today))

  console.log('\n👤 USER PROFILE:')
  console.log('Phone:', med.profiles?.phone)
  console.log('SMS opt-in:', med.profiles?.sms_opt_in)
  console.log('Timezone:', med.profiles?.timezone)

  console.log('\n🔍 TIME MATCHING LOGIC:')
  const reminderTimes = Array.isArray(med.reminder_times) ? med.reminder_times : []
  console.log('Looking for current time:', currentTime)
  console.log('Reminder times to check:', reminderTimes)

  reminderTimes.forEach(time => {
    const [hour, minute] = time.split(':')
    const matches = hour === String(currentHour).padStart(2, '0') &&
                   minute === String(currentMinute).padStart(2, '0')
    console.log(`  ${time}: ${matches ? '✅ MATCH' : '❌ no match'} (comparing ${hour}:${minute} vs ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')})`)
  })

  // Check if reminder was already sent today
  console.log('\n📝 CHECKING REMINDER LOG:')
  const { data: logEntries, error: logError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('medication_id', med.id)
    .eq('reminder_date', today)
    .order('created_at', { ascending: false })

  if (logError) {
    console.error('❌ Error checking log:', logError)
  } else if (logEntries && logEntries.length > 0) {
    console.log('Found log entries for today:')
    logEntries.forEach(entry => {
      console.log(`  - ${entry.reminder_time} (created: ${entry.created_at})`)
    })
  } else {
    console.log('❌ NO LOG ENTRIES found for today - reminder was NEVER sent')
  }

  // Check for 20:10 specifically
  console.log('\n🎯 CHECKING FOR 20:10 REMINDER:')
  const { data: log2010, error: log2010Error } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('medication_id', med.id)
    .eq('reminder_date', today)
    .eq('reminder_time', '20:10')

  if (log2010 && log2010.length > 0) {
    console.log('✅ Reminder WAS logged for 20:10')
    console.log(JSON.stringify(log2010, null, 2))
  } else {
    console.log('❌ NO reminder logged for 20:10 - THIS IS THE PROBLEM')
  }

  // Check dose records
  console.log('\n💉 CHECKING DOSE RECORDS FOR TODAY:')
  const { data: doses, error: dosesError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', med.id)
    .gte('scheduled_time', nowPST.startOf('day').toISO())
    .order('scheduled_time', { ascending: false })

  if (dosesError) {
    console.error('❌ Error fetching doses:', dosesError)
  } else if (doses && doses.length > 0) {
    console.log('Found dose records for today:')
    doses.forEach(dose => {
      console.log(`  - ${dose.scheduled_time} | Status: ${dose.status}`)
    })
  } else {
    console.log('❌ NO DOSE RECORDS for today - dose was NOT created')
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 DIAGNOSIS:')
  console.log('='.repeat(80))

  if (!logEntries || logEntries.length === 0) {
    console.log('❌ ISSUE: Cron job did NOT run or did NOT match the reminder time')
    console.log('   Possible causes:')
    console.log('   1. Cron job not running on Render')
    console.log('   2. Time matching logic is broken')
    console.log('   3. Timezone conversion issue')
    console.log('   4. User profile missing phone or opted out')
  }

  if (med.profiles?.sms_opt_in === false) {
    console.log('❌ ISSUE: User has SMS opt-in set to FALSE')
  }

  if (!med.profiles?.phone) {
    console.log('❌ ISSUE: User has no phone number')
  }

  console.log('\n')
}

debugMedicationReminder().catch(console.error)
