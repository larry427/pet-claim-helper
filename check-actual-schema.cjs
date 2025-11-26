// Check actual database schema
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  console.log('\n=== CHECKING ACTUAL DATABASE SCHEMA ===\n')

  // Check if table exists and what columns it has
  const { data, error } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error querying table:', error.message)
    console.log('\nTable may not exist or have different schema')
  } else {
    console.log('Table exists! Sample row structure:', data)
  }

  // Try to get all logs
  const { data: allLogs, error: allError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (allError) {
    console.error('Error:', allError)
  } else {
    console.log(`\nFound ${allLogs?.length || 0} total log entries`)
    if (allLogs?.length > 0) {
      console.log('\nColumns:', Object.keys(allLogs[0]))
      console.log('\nRecent entries:')
      allLogs.forEach(log => {
        console.log(`  - Med ID: ${log.medication_id?.substring(0, 8)}...`)
        console.log(`    Date: ${log.reminder_date}, Time: ${log.reminder_time}`)
        console.log(`    Created: ${log.created_at}`)
      })
    }
  }

  // Check the medications
  console.log('\n\n=== CHECKING MEDICATIONS ===\n')
  const { data: meds, error: medsError } = await supabase
    .from('medications')
    .select('id, medication_name, reminder_times, start_date, end_date, pets(name), profiles(phone, sms_opt_in)')
    .or('medication_name.ilike.%antigen%,medication_name.ilike.%apoquel%')

  if (medsError) {
    console.error('Error:', medsError)
  } else {
    meds?.forEach(med => {
      console.log(`\n${med.medication_name}:`)
      console.log(`  ID: ${med.id}`)
      console.log(`  Pet: ${med.pets?.name}`)
      console.log(`  Times: ${JSON.stringify(med.reminder_times)}`)
      console.log(`  Active: ${med.start_date} to ${med.end_date}`)
      console.log(`  Phone: ${med.profiles?.phone}`)
      console.log(`  SMS opt-in: ${med.profiles?.sms_opt_in}`)

      // Check if it should have sent today
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const isActive = med.start_date <= today && (!med.end_date || med.end_date >= today)
      console.log(`  Should be active today (${today}): ${isActive}`)
    })
  }
}

checkSchema()
