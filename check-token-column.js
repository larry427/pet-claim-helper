import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTokenColumn() {
  console.log('🔍 CHECKING TOKEN COLUMN')
  console.log('='.repeat(80))

  // Get all doses to see if token column exists
  const { data: doses, error } = await supabase
    .from('medication_doses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.log('❌ Error:', error.message)
    return
  }

  console.log(`\nFound ${doses.length} recent doses:\n`)

  for (const dose of doses) {
    console.log('─'.repeat(80))
    console.log('Dose ID:', dose.id)
    console.log('Medication ID:', dose.medication_id)
    console.log('Status:', dose.status)
    console.log('Scheduled time:', dose.scheduled_time)
    console.log('Created at:', dose.created_at)
    console.log('one_time_token:', dose.one_time_token || '❌ NULL or missing column')
    console.log('token_expires_at:', dose.token_expires_at || '❌ NULL or missing column')
  }

  // Check if any doses have tokens
  const withTokens = doses.filter(d => d.one_time_token)
  console.log('\n' + '='.repeat(80))
  console.log(`Doses with tokens: ${withTokens.length} / ${doses.length}`)

  if (withTokens.length === 0) {
    console.log('\n🚨 PROBLEM: No doses have tokens!')
    console.log('This means either:')
    console.log('  1. Migration SQL was not run correctly')
    console.log('  2. Column was added but cron code hasn\'t been deployed')
    console.log('  3. Cron hasn\'t run since deployment')
  }

  // Look for the specific medication that sent the SMS
  console.log('\n📋 Looking for medication that sent SMS at 10:30...')
  const { data: recentDoses } = await supabase
    .from('medication_doses')
    .select('*, medications(medication_name)')
    .gte('created_at', '2025-11-15T05:25:00Z') // Around 10:25 PM PST
    .lte('created_at', '2025-11-15T05:35:00Z') // Around 10:35 PM PST
    .order('created_at', { ascending: false })

  if (recentDoses && recentDoses.length > 0) {
    console.log(`\nFound ${recentDoses.length} doses created around 10:30 PM:`)
    for (const d of recentDoses) {
      console.log('  -', d.medications?.medication_name, '| Token:', d.one_time_token || '❌ MISSING')
    }
  } else {
    console.log('❌ No doses found around that time')
  }
}

checkTokenColumn().catch(console.error)
