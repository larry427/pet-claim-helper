import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function compareMedications() {
  console.log('🔍 COMPARING MEDICATIONS')
  console.log('='.repeat(80))

  // Get Code's working medication
  const { data: codeMed, error: codeError } = await supabase
    .from('medications')
    .select('*')
    .eq('medication_name', 'TEST_SMS_20:48')
    .single()

  // Get User's non-working medication
  const { data: userMed, error: userError } = await supabase
    .from('medications')
    .select('*')
    .eq('medication_name', 'nexttestmeds')
    .single()

  if (codeError) {
    console.error('❌ Error fetching Code medication:', codeError)
  }

  if (userError) {
    console.error('❌ Error fetching User medication:', userError)
  }

  if (!codeMed) {
    console.log('❌ Code medication not found')
  }

  if (!userMed) {
    console.log('❌ User medication not found')
  }

  if (!codeMed || !userMed) {
    return
  }

  console.log('\n📊 SIDE-BY-SIDE COMPARISON:')
  console.log('='.repeat(80))

  const fields = [
    'id',
    'user_id',
    'pet_id',
    'medication_name',
    'dosage',
    'frequency',
    'reminder_times',
    'start_date',
    'end_date',
    'created_at',
    'updated_at',
  ]

  for (const field of fields) {
    const codeVal = codeMed[field]
    const userVal = userMed[field]
    const match = JSON.stringify(codeVal) === JSON.stringify(userVal)

    console.log(`\n${field}:`)
    console.log(`  Code (✅ works):  ${JSON.stringify(codeVal)}`)
    console.log(`  User (❌ broken): ${JSON.stringify(userVal)}`)

    if (!match && field !== 'id' && field !== 'created_at' && field !== 'updated_at' && field !== 'medication_name') {
      console.log(`  ⚠️  DIFFERENT! This might be the issue`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 DETAILED REMINDER_TIMES ANALYSIS:')
  console.log('='.repeat(80))

  console.log('\nCode medication (WORKS):')
  console.log('  Value:', codeMed.reminder_times)
  console.log('  Type:', typeof codeMed.reminder_times)
  console.log('  Is Array:', Array.isArray(codeMed.reminder_times))
  if (Array.isArray(codeMed.reminder_times)) {
    console.log('  Length:', codeMed.reminder_times.length)
    console.log('  Items:', codeMed.reminder_times.map(t => `"${t}"`).join(', '))
  }

  console.log('\nUser medication (BROKEN):')
  console.log('  Value:', userMed.reminder_times)
  console.log('  Type:', typeof userMed.reminder_times)
  console.log('  Is Array:', Array.isArray(userMed.reminder_times))
  if (Array.isArray(userMed.reminder_times)) {
    console.log('  Length:', userMed.reminder_times.length)
    console.log('  Items:', userMed.reminder_times.map(t => `"${t}"`).join(', '))
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 DATE COMPARISON:')
  console.log('='.repeat(80))

  const now = new Date()
  const todayLocal = now.toISOString().split('T')[0]
  console.log('\nToday (local):', todayLocal)
  console.log('Code start_date:', codeMed.start_date, codeMed.start_date === todayLocal ? '✅' : '❌')
  console.log('User start_date:', userMed.start_date, userMed.start_date === todayLocal ? '✅' : '❌')

  console.log('\n' + '='.repeat(80))
}

compareMedications().catch(console.error)
