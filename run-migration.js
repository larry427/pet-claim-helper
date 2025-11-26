import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('🔧 CREATING medication_reminders_log TABLE')
  console.log('='.repeat(80))

  // Read the SQL file
  const sql = fs.readFileSync('create-log-table.sql', 'utf8')

  console.log('\nSQL to execute:')
  console.log(sql)

  console.log('\n' + '='.repeat(80))
  console.log('⚠️  NOTE: Supabase client cannot execute raw DDL SQL.')
  console.log('You need to run this SQL manually in Supabase SQL Editor.')
  console.log('='.repeat(80))

  console.log('\n📋 INSTRUCTIONS:')
  console.log('1. Go to: https://supabase.com/dashboard/project/hyrgqrgeshkgvsfwnzzu/sql/new')
  console.log('2. Copy the SQL from create-log-table.sql')
  console.log('3. Paste it into the SQL Editor')
  console.log('4. Click "Run"')
  console.log('5. Come back and run this script again to verify')

  console.log('\n🔍 OR I can try to create it programmatically...')

  // Try using rpc or direct insert (won't work for DDL but let's see)
  try {
    // Create the table using service role - this might work
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    })

    if (error) {
      console.log('\n❌ Cannot execute DDL via client:', error.message)
      console.log('\n⚠️  YOU MUST RUN THE SQL MANUALLY (see instructions above)')
    } else {
      console.log('\n✅ Table created successfully!')
    }
  } catch (e) {
    console.log('\n❌ RPC function not available')
    console.log('\n⚠️  YOU MUST RUN THE SQL MANUALLY (see instructions above)')
  }

  // Try to verify if table exists now
  console.log('\n🔍 Verifying table...')
  const { data: testData, error: testError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .limit(1)

  if (testError) {
    console.log('❌ Table still not accessible:', testError.message)
    console.log('\n📋 MANUAL ACTION REQUIRED - RUN THE SQL IN SUPABASE!')
  } else {
    console.log('✅ Table is accessible!')
  }
}

runMigration().catch(console.error)
