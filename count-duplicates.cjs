// Count duplicate SMS sends by date
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function countDuplicates() {
  console.log('\n=== COUNTING DUPLICATE SMS SENDS ===\n')

  // Get Antigens medication ID
  const { data: antigens } = await supabase
    .from('medications')
    .select('id, medication_name')
    .ilike('medication_name', '%antigen%')
    .single()

  const { data: apoquel } = await supabase
    .from('medications')
    .select('id, medication_name')
    .ilike('medication_name', '%apoquel%')
    .single()

  console.log('Antigens ID:', antigens?.id)
  console.log('Apoquel ID:', apoquel?.id)

  // Count logs by date
  const dates = ['2025-11-17', '2025-11-18', '2025-11-19', '2025-11-20', '2025-11-21', '2025-11-22', '2025-11-23']

  for (const date of dates) {
    const { data: antigenLogs } = await supabase
      .from('medication_reminders_log')
      .select('*')
      .eq('medication_id', antigens?.id)
      .eq('reminder_date', date)

    const { data: apoquelLogs } = await supabase
      .from('medication_reminders_log')
      .select('*')
      .eq('medication_id', apoquel?.id)
      .eq('reminder_date', date)

    console.log(`\n${date}:`)
    console.log(`  Antigens: ${antigenLogs?.length || 0} reminders sent`)
    console.log(`  Apoquel: ${apoquelLogs?.length || 0} reminders sent`)

    if (antigenLogs?.length > 1) {
      console.log('  ⚠️  DUPLICATES for Antigens:')
      antigenLogs.forEach(log => {
        console.log(`    - ${log.created_at} (${log.id})`)
      })
    }

    if (apoquelLogs?.length > 1) {
      console.log('  ⚠️  DUPLICATES for Apoquel:')
      apoquelLogs.forEach(log => {
        console.log(`    - ${log.created_at} (${log.id})`)
      })
    }
  }

  // Check if unique constraint exists
  console.log('\n\n=== CHECKING UNIQUE CONSTRAINT ===\n')

  // Try to insert duplicate
  const testInsert1 = await supabase
    .from('medication_reminders_log')
    .insert({
      medication_id: antigens?.id,
      user_id: 'b7486f8d-c69f-4069-acfd-a6cb22bdd664', // Known user
      reminder_date: '2099-12-31',
      reminder_time: '99:99'
    })

  const testInsert2 = await supabase
    .from('medication_reminders_log')
    .insert({
      medication_id: antigens?.id,
      user_id: 'b7486f8d-c69f-4069-acfd-a6cb22bdd664',
      reminder_date: '2099-12-31',
      reminder_time: '99:99'
    })

  console.log('First insert:', testInsert1.error ? `FAILED: ${testInsert1.error.message}` : 'SUCCESS')
  console.log('Second insert:', testInsert2.error ? `FAILED (constraint working): ${testInsert2.error.code}` : '⚠️  SUCCESS (NO CONSTRAINT!)')

  // Cleanup
  await supabase
    .from('medication_reminders_log')
    .delete()
    .eq('reminder_date', '2099-12-31')

  console.log('\n')
}

countDuplicates()
