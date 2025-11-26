import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function criticalInvestigation() {
  console.log('🚨 CRITICAL INVESTIGATION - MEDICATION REMINDERS NOT FIRING')
  console.log('='.repeat(100))

  // Step 1: Query ALL fields for the three medications
  console.log('\n📋 STEP 1: DATABASE COMPARISON - ALL MEDICATIONS')
  console.log('-'.repeat(100))

  const { data: allMeds, error: medsError } = await supabase
    .from('medications')
    .select('*')
    .in('medication_name', ['TEST_SMS_20:48', 'UI_TEST_21:16', 'Qberts for doggy'])
    .order('created_at', { ascending: true })

  if (medsError) {
    console.error('❌ Error querying medications:', medsError)
    return
  }

  if (!allMeds || allMeds.length === 0) {
    console.log('❌ No medications found')
    return
  }

  console.log(`\nFound ${allMeds.length} medication(s)\n`)

  // Print each medication with all fields
  for (let i = 0; i < allMeds.length; i++) {
    const med = allMeds[i]
    const status = med.medication_name === 'TEST_SMS_20:48' ? '✅ WORKS' : '❌ BROKEN'

    console.log(`\n${i + 1}. ${med.medication_name} ${status}`)
    console.log('─'.repeat(100))
    console.log('ID:              ', med.id)
    console.log('user_id:         ', med.user_id)
    console.log('pet_id:          ', med.pet_id)
    console.log('claim_id:        ', med.claim_id)
    console.log('medication_name: ', med.medication_name)
    console.log('dosage:          ', med.dosage)
    console.log('frequency:       ', med.frequency)
    console.log('reminder_times:  ', JSON.stringify(med.reminder_times))
    console.log('  → Type:        ', typeof med.reminder_times)
    console.log('  → Is Array:    ', Array.isArray(med.reminder_times))
    console.log('  → Length:      ', Array.isArray(med.reminder_times) ? med.reminder_times.length : 'N/A')
    console.log('  → Values:      ', Array.isArray(med.reminder_times) ? med.reminder_times.map(t => `"${t}"`).join(', ') : 'N/A')
    console.log('start_date:      ', med.start_date)
    console.log('end_date:        ', med.end_date)
    console.log('created_at:      ', med.created_at)
    console.log('updated_at:      ', med.updated_at)
  }

  // Step 2: Simulate the cron job matching logic
  console.log('\n\n🔍 STEP 2: CRON MATCHING SIMULATION')
  console.log('='.repeat(100))

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const currentHour = nowPST.hour
  const currentMinute = nowPST.minute
  const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
  const today = nowPST.toISODate()

  console.log('\nCurrent PST time:', nowPST.toISO())
  console.log('Current time (HH:mm):', currentTime)
  console.log('Today (PST):', today)

  console.log('\n--- Testing each medication against cron logic ---\n')

  for (const med of allMeds) {
    const status = med.medication_name === 'TEST_SMS_20:48' ? '✅ WORKS' : '❌ BROKEN'
    console.log(`\nTesting: ${med.medication_name} ${status}`)
    console.log('─'.repeat(100))

    // Check 1: Date range
    const startDate = med.start_date
    const endDate = med.end_date

    console.log('CHECK 1 - Date Range:')
    console.log('  start_date:', startDate)
    console.log('  end_date:', endDate)
    console.log('  today:', today)
    console.log('  Is after start?', startDate <= today ? '✅ YES' : '❌ NO (would skip)')
    console.log('  Is before end?', !endDate || endDate >= today ? '✅ YES' : '❌ NO (would skip)')

    if (startDate > today) {
      console.log('  ⚠️  SKIP REASON: Medication has not started yet')
      continue
    }

    if (endDate && endDate < today) {
      console.log('  ⚠️  SKIP REASON: Medication has ended')
      continue
    }

    // Check 2: reminder_times format and matching
    console.log('\nCHECK 2 - Reminder Times:')
    const reminderTimes = Array.isArray(med.reminder_times) ? med.reminder_times : []
    console.log('  reminder_times:', JSON.stringify(reminderTimes))
    console.log('  Is array?', Array.isArray(med.reminder_times) ? '✅ YES' : '❌ NO (would skip)')
    console.log('  Has values?', reminderTimes.length > 0 ? '✅ YES' : '❌ NO (would skip)')

    if (reminderTimes.length === 0) {
      console.log('  ⚠️  SKIP REASON: No reminder times')
      continue
    }

    console.log('\nCHECK 3 - Time Matching:')
    console.log('  Looking for current time:', currentTime)

    let matched = false
    for (const time of reminderTimes) {
      const [hour, minute] = time.split(':')
      const matches = hour === String(currentHour).padStart(2, '0') &&
                     minute === String(currentMinute).padStart(2, '0')
      console.log(`  Time "${time}":`, matches ? '✅ MATCH (would send SMS)' : '❌ no match')
      if (matches) matched = true
    }

    if (!matched) {
      console.log('  ⚠️  SKIP REASON: No time matches current minute')
    }
  }

  // Step 3: Run the EXACT query the cron uses
  console.log('\n\n🔍 STEP 3: EXACT CRON QUERY SIMULATION')
  console.log('='.repeat(100))

  console.log('\nRunning the exact query the cron job uses:')
  console.log('  .from("medications")')
  console.log('  .select("*, pets(name, species), profiles(phone, email, sms_opt_in)")')
  console.log('  .not("reminder_times", "is", null)')

  const { data: cronMeds, error: cronError } = await supabase
    .from('medications')
    .select('*, pets(name, species), profiles(phone, email, sms_opt_in)')
    .not('reminder_times', 'is', null)

  if (cronError) {
    console.error('\n❌ Cron query error:', cronError)
    return
  }

  console.log(`\nCron query returned ${cronMeds.length} medication(s)\n`)

  // Filter to our test medications
  const testMeds = cronMeds.filter(m =>
    ['TEST_SMS_20:48', 'UI_TEST_21:16', 'Qberts for doggy'].includes(m.medication_name)
  )

  console.log('Our test medications in cron results:')
  for (const med of testMeds) {
    const status = med.medication_name === 'TEST_SMS_20:48' ? '✅ WORKS' : '❌ BROKEN'
    console.log(`\n  ${med.medication_name} ${status}`)
    console.log('    reminder_times:', JSON.stringify(med.reminder_times))
    console.log('    start_date:', med.start_date)
    console.log('    end_date:', med.end_date)
    console.log('    phone:', med.profiles?.phone || 'NULL')
    console.log('    sms_opt_in:', med.profiles?.sms_opt_in)
  }

  // Step 4: Check for logs
  console.log('\n\n🔍 STEP 4: CHECK REMINDER LOGS')
  console.log('='.repeat(100))

  const medIds = allMeds.map(m => m.id)

  try {
    const { data: logs, error: logsError } = await supabase
      .from('medication_reminders_log')
      .select('*')
      .in('medication_id', medIds)
      .order('created_at', { ascending: false })

    if (logsError && logsError.code !== 'PGRST116') {
      console.log('\n⚠️  Log table query error:', logsError.message)
    } else if (!logs || logs.length === 0) {
      console.log('\n❌ NO LOGS FOUND - Reminders were never attempted')
    } else {
      console.log(`\nFound ${logs.length} log entries:`)
      for (const log of logs) {
        const med = allMeds.find(m => m.id === log.medication_id)
        console.log(`  ${med?.medication_name}: ${log.reminder_date} ${log.reminder_time}`)
      }
    }
  } catch (e) {
    console.log('\n⚠️  Could not check logs (table may not exist)')
  }

  console.log('\n\n' + '='.repeat(100))
  console.log('🔍 ANALYSIS COMPLETE')
  console.log('='.repeat(100))
}

criticalInvestigation().catch(console.error)
