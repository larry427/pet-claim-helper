import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugToken() {
  console.log('🔍 DEBUGGING MAGIC LINK TOKEN')
  console.log('='.repeat(80))

  const token = '9df4c7f5-4552-4e92-aee8-b0c28f53e7a9'

  // Query 1: Find dose by token
  console.log('\n📋 QUERY 1: Finding dose by token')
  console.log('Token:', token)

  const { data: dose, error: doseError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('one_time_token', token)
    .single()

  if (doseError) {
    console.log('❌ Error:', doseError.message)
    console.log('Code:', doseError.code)
  } else if (!dose) {
    console.log('❌ No dose found with this token')
  } else {
    console.log('✅ Dose found!')
    console.log('Dose ID:', dose.id)
    console.log('Medication ID:', dose.medication_id)
    console.log('User ID:', dose.user_id)
    console.log('Status:', dose.status)
    console.log('Token expires at:', dose.token_expires_at)
    console.log('Scheduled time:', dose.scheduled_time)

    // Check if token is expired
    const nowPST = DateTime.now().setZone('America/Los_Angeles')
    const expiresAt = DateTime.fromISO(dose.token_expires_at)
    const isExpired = nowPST > expiresAt

    console.log('\nToken expiration check:')
    console.log('  Current time (PST):', nowPST.toISO())
    console.log('  Expires at:', expiresAt.toISO())
    console.log('  Is expired?', isExpired ? '❌ YES' : '✅ NO')

    // Query 2: Get medication details
    console.log('\n📋 QUERY 2: Getting medication details')
    const { data: medication, error: medError } = await supabase
      .from('medications')
      .select('*, pets(name, species)')
      .eq('id', dose.medication_id)
      .single()

    if (medError) {
      console.log('❌ Error:', medError.message)
    } else if (!medication) {
      console.log('❌ Medication not found')
    } else {
      console.log('✅ Medication found!')
      console.log('Name:', medication.medication_name)
      console.log('Pet:', medication.pets?.name)
    }
  }

  console.log('\n' + '='.repeat(80))
}

debugToken().catch(console.error)
