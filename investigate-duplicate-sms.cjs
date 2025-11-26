// Investigate duplicate SMS reminders issue
const { createClient } = require('@supabase/supabase-js')
const { DateTime } = require('luxon')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function investigate() {
  console.log('\n=== INVESTIGATING DUPLICATE SMS ISSUE ===\n')

  // 1. Check medications for Antigen and Apoquel
  console.log('1. Finding Antigen and Apoquel medications...')
  const { data: meds, error: medsError } = await supabase
    .from('medications')
    .select('*, pets(name), profiles(phone, email, sms_opt_in)')
    .or('medication_name.ilike.%antigen%,medication_name.ilike.%apoquel%')

  if (medsError) {
    console.error('Error:', medsError)
    return
  }

  console.log(`Found ${meds?.length || 0} medications:`)
  meds?.forEach(med => {
    console.log(`\n  - ${med.medication_name} (ID: ${med.id})`)
    console.log(`    Pet: ${med.pets?.name}`)
    console.log(`    Reminder times: ${JSON.stringify(med.reminder_times)}`)
    console.log(`    Start: ${med.start_date}, End: ${med.end_date}`)
    console.log(`    Phone: ${med.profiles?.phone}, SMS opt-in: ${med.profiles?.sms_opt_in}`)
  })

  // 2. Check medication_reminders_log for these medications
  console.log('\n\n2. Checking medication_reminders_log for sent reminders...')

  const medIds = meds?.map(m => m.id) || []
  if (medIds.length > 0) {
    const { data: logs, error: logsError } = await supabase
      .from('medication_reminders_log')
      .select('*')
      .in('medication_id', medIds)
      .order('sent_at', { ascending: false })
      .limit(50)

    if (logsError) {
      console.error('Error:', logsError)
    } else {
      console.log(`Found ${logs?.length || 0} log entries:`)
      logs?.forEach(log => {
        const med = meds.find(m => m.id === log.medication_id)
        console.log(`\n  - ${med?.medication_name} on ${log.reminder_date} at ${log.reminder_time}`)
        console.log(`    Sent at: ${log.sent_at}`)
        console.log(`    Message ID: ${log.message_id}`)
      })
    }
  }

  // 3. Check for Friday/Saturday (Nov 22-23, 2025)
  console.log('\n\n3. Checking ALL reminders sent on 2025-11-22 and 2025-11-23...')
  const { data: recentLogs, error: recentError } = await supabase
    .from('medication_reminders_log')
    .select('*, medications(medication_name)')
    .in('reminder_date', ['2025-11-22', '2025-11-23'])
    .order('sent_at', { ascending: true })

  if (recentError) {
    console.error('Error:', recentError)
  } else {
    console.log(`Found ${recentLogs?.length || 0} reminders sent on Friday/Saturday:`)

    // Group by medication
    const byMed = {}
    recentLogs?.forEach(log => {
      const medName = log.medications?.medication_name || 'Unknown'
      if (!byMed[medName]) byMed[medName] = []
      byMed[medName].push(log)
    })

    Object.entries(byMed).forEach(([medName, logs]) => {
      console.log(`\n  ${medName}: ${logs.length} reminders sent`)
      logs.forEach(log => {
        console.log(`    - ${log.reminder_date} at ${log.reminder_time} (${log.sent_at})`)
      })
    })
  }

  // 4. Check if database constraint exists
  console.log('\n\n4. Testing if unique constraint is active...')
  const testMedId = meds?.[0]?.id
  if (testMedId) {
    const testDate = '2099-01-01'
    const testTime = '99:99'

    // Try to insert twice
    const { error: insert1 } = await supabase
      .from('medication_reminders_log')
      .insert({
        medication_id: testMedId,
        user_id: meds[0].user_id,
        reminder_date: testDate,
        reminder_time: testTime,
        message_id: 'TEST1'
      })

    const { error: insert2 } = await supabase
      .from('medication_reminders_log')
      .insert({
        medication_id: testMedId,
        user_id: meds[0].user_id,
        reminder_date: testDate,
        reminder_time: testTime,
        message_id: 'TEST2'
      })

    if (insert1) {
      console.log('  First insert failed:', insert1.message)
    } else {
      console.log('  First insert succeeded')
    }

    if (insert2) {
      console.log('  Second insert failed (GOOD - constraint working):', insert2.code)
    } else {
      console.log('  ⚠️  Second insert succeeded (BAD - no constraint!)')
    }

    // Clean up test
    await supabase
      .from('medication_reminders_log')
      .delete()
      .eq('reminder_date', testDate)
  }

  console.log('\n\n=== INVESTIGATION COMPLETE ===\n')
}

investigate()
