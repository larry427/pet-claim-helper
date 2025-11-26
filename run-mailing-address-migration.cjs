const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('🔧 ADDING address AND phone COLUMNS TO profiles TABLE')
  console.log('='.repeat(80))

  // Read the SQL file
  const sqlPath = path.join(__dirname, 'server', 'migrations', 'add-mailing-address.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('\nSQL to execute:')
  console.log(sql)

  console.log('\n' + '='.repeat(80))
  console.log('⚠️  NOTE: Supabase client cannot execute raw DDL SQL.')
  console.log('You need to run this SQL manually in Supabase SQL Editor.')
  console.log('='.repeat(80))

  console.log('\n📋 INSTRUCTIONS:')
  console.log('1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new')
  console.log('2. Copy the SQL from server/migrations/add-mailing-address.sql')
  console.log('3. Paste it into the SQL Editor')
  console.log('4. Click "Run"')
  console.log('5. Done!')

  console.log('\n✅ Migration script completed')
  console.log('Manual action required: Run the SQL in Supabase SQL Editor')
}

runMigration().catch(console.error)
