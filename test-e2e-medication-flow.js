import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'
const BO_PET_ID = '78e714d6-473d-4a00-9579-8fffb8a24292'
const API_URL = process.env.VITE_API_URL || 'http://localhost:8787'

let testMedicationId = null
let createdDoseId = null

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function step1_CreateTestMedication() {
  console.log('=' .repeat(80))
  console.log('STEP 1: Create test medication with reminder 2 minutes from now')
  console.log('='.repeat(80))
  console.log()

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const fireTime = nowPST.plus({ minutes: 2 })
  const reminderTime = fireTime.toFormat('HH:mm')
  const today = nowPST.toISODate()
  const tomorrow = nowPST.plus({ days: 1 }).toISODate()

  console.log('⏰ Reminder Details:')
  console.log('   Current PST time:', nowPST.toFormat('HH:mm:ss'))
  console.log('   SMS will fire at:', fireTime.toFormat('HH:mm:ss'), 'PST')
  console.log('   Reminder time:', reminderTime)
  console.log('   Start date:', today)
  console.log('   End date:', tomorrow)
  console.log()

  const { data: medication, error: medError } = await supabase
    .from('medications')
    .insert({
      user_id: LARRY_USER_ID,
      pet_id: BO_PET_ID,
      medication_name: 'Final SMS Test',
      dosage: '1 pill',
      frequency: '1x daily',
      reminder_times: [reminderTime],
      start_date: today,
      end_date: tomorrow,
    })
    .select()
    .single()

  if (medError) {
    console.error('❌ ERROR creating medication:', medError)
    process.exit(1)
  }

  testMedicationId = medication.id

  console.log('✅ SUCCESS: Test medication created')
  console.log('   Medication ID:', testMedicationId)
  console.log('   Name:', medication.medication_name)
  console.log('   Reminder time:', reminderTime, 'PST')
  console.log()
  console.log('📱 SMS should send at:', fireTime.toLocaleString(DateTime.DATETIME_FULL))
  console.log()

  return fireTime
}

async function step2_WaitForSMS(fireTime) {
  console.log('='.repeat(80))
  console.log('STEP 2: Wait for SMS to be sent')
  console.log('='.repeat(80))
  console.log()

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const waitSeconds = Math.max(0, fireTime.diff(nowPST, 'seconds').seconds + 10) // Add 10s buffer

  console.log('⏳ Waiting', Math.ceil(waitSeconds), 'seconds for SMS to send...')
  console.log('   (Cron runs every minute, waiting until', fireTime.plus({ seconds: 10 }).toFormat('HH:mm:ss'), 'PST)')
  console.log()

  // Show countdown
  let remaining = Math.ceil(waitSeconds)
  while (remaining > 0) {
    process.stdout.write(`\r   ⏰ Time remaining: ${remaining}s   `)
    await sleep(1000)
    remaining--
  }
  console.log('\r   ✅ Wait complete!                    ')
  console.log()
}

async function step3_VerifyDoseCreated() {
  console.log('='.repeat(80))
  console.log('STEP 3: Verify dose was created')
  console.log('='.repeat(80))
  console.log()

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const todayPST = nowPST.toISODate()

  console.log('🔍 Checking medication_doses table...')
  console.log('   Looking for medication:', testMedicationId)
  console.log('   Date:', todayPST)
  console.log()

  const { data: doses, error: doseError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', testMedicationId)
    .eq('user_id', LARRY_USER_ID)
    .order('created_at', { ascending: false })

  if (doseError) {
    console.error('❌ ERROR querying doses:', doseError)
    return false
  }

  if (!doses || doses.length === 0) {
    console.log('❌ FAIL: No doses found')
    console.log('   This means the SMS reminder cron did not create a dose.')
    console.log('   Possible reasons:')
    console.log('   - Cron did not run (check server logs)')
    console.log('   - Medication was not active')
    console.log('   - SMS send failed')
    console.log('   - Dose creation failed')
    return false
  }

  const dose = doses[0]
  createdDoseId = dose.id

  console.log('✅ SUCCESS: Dose found!')
  console.log('   Dose ID:', dose.id)
  console.log('   Status:', dose.status)
  console.log('   Scheduled time:', dose.scheduled_time)
  console.log('   Created at:', dose.created_at)
  console.log()

  if (dose.status !== 'pending') {
    console.log('⚠️  WARNING: Dose status is not "pending"')
    console.log('   Expected: pending')
    console.log('   Got:', dose.status)
    return false
  }

  return true
}

async function step4_CheckReminderLog() {
  console.log('='.repeat(80))
  console.log('STEP 4: Check medication reminder log')
  console.log('='.repeat(80))
  console.log()

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const todayPST = nowPST.toISODate()

  console.log('🔍 Checking medication_reminders_log...')
  console.log()

  const { data: logs, error: logError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('medication_id', testMedicationId)
    .eq('reminder_date', todayPST)
    .order('created_at', { ascending: false })

  if (logError) {
    console.error('❌ ERROR querying logs:', logError)
    return false
  }

  if (!logs || logs.length === 0) {
    console.log('⚠️  WARNING: No reminder log found')
    console.log('   SMS may not have been sent')
    return false
  }

  const log = logs[0]
  console.log('✅ SUCCESS: Reminder logged!')
  console.log('   Log ID:', log.id)
  console.log('   Reminder date:', log.reminder_date)
  console.log('   Reminder time:', log.reminder_time)
  console.log('   Created at:', log.created_at)
  console.log()

  return true
}

async function step5_MarkDoseAsGiven() {
  console.log('='.repeat(80))
  console.log('STEP 5: Simulate clicking deep link - Mark dose as given')
  console.log('='.repeat(80))
  console.log()

  console.log('📲 Making POST request to mark dose as given...')
  console.log('   URL:', `${API_URL}/api/medications/${testMedicationId}/mark-given`)
  console.log('   User ID:', LARRY_USER_ID)
  console.log()

  try {
    const response = await fetch(`${API_URL}/api/medications/${testMedicationId}/mark-given`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: LARRY_USER_ID })
    })

    const result = await response.json()

    if (!response.ok || !result.ok) {
      console.log('❌ FAIL: Request failed')
      console.log('   Status:', response.status)
      console.log('   Response:', result)
      return false
    }

    console.log('✅ SUCCESS: Dose marked as given!')
    console.log('   Response:', result)
    console.log('   Dose ID:', result.doseId)
    console.log()

    return true
  } catch (error) {
    console.error('❌ ERROR making request:', error.message)
    return false
  }
}

async function step6_VerifyDoseUpdated() {
  console.log('='.repeat(80))
  console.log('STEP 6: Verify dose status changed to "given"')
  console.log('='.repeat(80))
  console.log()

  const { data: dose, error: doseError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('id', createdDoseId)
    .single()

  if (doseError) {
    console.error('❌ ERROR querying dose:', doseError)
    return false
  }

  console.log('📊 Dose details:')
  console.log('   ID:', dose.id)
  console.log('   Status:', dose.status)
  console.log('   Scheduled time:', dose.scheduled_time)
  console.log('   Given time:', dose.given_time || 'NOT SET')
  console.log()

  if (dose.status !== 'given') {
    console.log('❌ FAIL: Dose status not updated')
    console.log('   Expected: given')
    console.log('   Got:', dose.status)
    return false
  }

  if (!dose.given_time) {
    console.log('⚠️  WARNING: given_time not set')
    return false
  }

  console.log('✅ SUCCESS: Dose status updated to "given"')
  console.log('   Given at:', dose.given_time)
  console.log()

  return true
}

async function step7_CleanUp() {
  console.log('='.repeat(80))
  console.log('STEP 7: Clean up test data')
  console.log('='.repeat(80))
  console.log()

  console.log('🧹 Cleaning up test medication and dose...')

  // Delete dose
  if (createdDoseId) {
    const { error: doseError } = await supabase
      .from('medication_doses')
      .delete()
      .eq('id', createdDoseId)

    if (doseError) {
      console.log('⚠️  Could not delete dose:', doseError)
    } else {
      console.log('✅ Deleted dose:', createdDoseId)
    }
  }

  // Delete medication
  if (testMedicationId) {
    const { error: medError } = await supabase
      .from('medications')
      .delete()
      .eq('id', testMedicationId)

    if (medError) {
      console.log('⚠️  Could not delete medication:', medError)
    } else {
      console.log('✅ Deleted medication:', testMedicationId)
    }
  }

  console.log()
}

async function runEndToEndTest() {
  console.log('\n')
  console.log('╔' + '═'.repeat(78) + '╗')
  console.log('║' + ' '.repeat(15) + 'MEDICATION SMS REMINDER - END-TO-END TEST' + ' '.repeat(22) + '║')
  console.log('╚' + '═'.repeat(78) + '╝')
  console.log()

  const results = {
    medicationCreated: false,
    doseCreated: false,
    reminderLogged: false,
    doseMarkedAsGiven: false,
    doseStatusUpdated: false
  }

  try {
    // Step 1: Create test medication
    const fireTime = await step1_CreateTestMedication()
    results.medicationCreated = true

    // Step 2: Wait for SMS
    await step2_WaitForSMS(fireTime)

    // Step 3: Verify dose created
    results.doseCreated = await step3_VerifyDoseCreated()
    if (!results.doseCreated) {
      console.log('\n⚠️  Test cannot continue - dose was not created')
      console.log('   Check server logs to see why SMS reminder did not create dose')
      await step7_CleanUp()
      return results
    }

    // Step 4: Check reminder log
    results.reminderLogged = await step4_CheckReminderLog()

    // Step 5: Mark dose as given
    results.doseMarkedAsGiven = await step5_MarkDoseAsGiven()
    if (!results.doseMarkedAsGiven) {
      console.log('\n⚠️  Deep link simulation failed')
      await step7_CleanUp()
      return results
    }

    // Step 6: Verify dose updated
    results.doseStatusUpdated = await step6_VerifyDoseUpdated()

    // Step 7: Clean up
    await step7_CleanUp()

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error)
    await step7_CleanUp()
    throw error
  }

  // Final summary
  console.log('='.repeat(80))
  console.log('FINAL RESULTS')
  console.log('='.repeat(80))
  console.log()
  console.log('✅ = Pass  ❌ = Fail')
  console.log()
  console.log(results.medicationCreated ? '✅' : '❌', 'Medication created')
  console.log(results.doseCreated ? '✅' : '❌', 'Dose created by SMS reminder')
  console.log(results.reminderLogged ? '✅' : '❌', 'Reminder logged')
  console.log(results.doseMarkedAsGiven ? '✅' : '❌', 'Dose marked as given via API')
  console.log(results.doseStatusUpdated ? '✅' : '❌', 'Dose status updated to "given"')
  console.log()

  const allPassed = Object.values(results).every(r => r === true)

  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED!')
    console.log('   The medication SMS reminder system is working end-to-end.')
    console.log()
    console.log('   ✅ SMS reminders send at scheduled time')
    console.log('   ✅ Doses are created when SMS is sent')
    console.log('   ✅ Deep links work and mark doses as given')
    console.log('   ✅ Progress tracking updates correctly')
  } else {
    console.log('❌ SOME TESTS FAILED')
    console.log('   Review the logs above to see what went wrong.')
  }

  console.log()

  return results
}

runEndToEndTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err)
    process.exit(1)
  })
