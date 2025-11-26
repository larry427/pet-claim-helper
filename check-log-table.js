import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkLogTable() {
  console.log('🔍 CHECKING medication_reminders_log TABLE')
  console.log('='.repeat(80))

  // Try to query the table
  const { data, error } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .limit(1)

  if (error) {
    console.log('\n❌ TABLE DOES NOT EXIST OR IS NOT ACCESSIBLE')
    console.log('Error:', error.message)
    console.log('Error code:', error.code)
    console.log('\n🚨 THIS IS THE BUG!')
    console.log('The cron job tries to query this table and fails.')
    console.log('When the query fails, the code likely crashes or skips the medication.')
  } else {
    console.log('\n✅ Table exists and is accessible')
    console.log('Found', data?.length || 0, 'records')
  }

  // Check if table exists in Supabase using RPC or by listing tables
  console.log('\n📋 Checking database schema...')

  // Try to get table info
  const { data: tables, error: schemaError } = await supabase
    .rpc('get_tables')
    .select()

  if (schemaError) {
    console.log('Could not list tables:', schemaError.message)
  }
}

checkLogTable().catch(console.error)
