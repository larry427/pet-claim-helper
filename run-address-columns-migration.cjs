const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

async function runMigration() {
  console.log('🔧 Running address columns migration...')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Read the SQL file
  const sqlPath = path.join(__dirname, 'add-address-columns.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('📄 SQL to execute:')
  console.log(sql)
  console.log('')

  // Execute the migration using Supabase RPC
  // Note: Supabase doesn't have a direct SQL execution API in the client
  // We need to execute this via the Supabase dashboard or use postgres client

  console.log('⚠️  Note: Supabase client library cannot execute DDL statements directly')
  console.log('Options to run this migration:')
  console.log('1. Copy the SQL from add-address-columns.sql and run it in Supabase Dashboard > SQL Editor')
  console.log('2. Use psql command line tool with database connection string')
  console.log('')
  console.log('For now, let me verify the current schema...')

  // Try to query profiles to see current columns
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)

  if (error) {
    console.log('❌ Error querying profiles:', error.message)
  } else if (data && data.length > 0) {
    console.log('✅ Current profiles table columns:')
    console.log(Object.keys(data[0]))

    const hasCity = 'city' in data[0]
    const hasState = 'state' in data[0]
    const hasZip = 'zip' in data[0]

    console.log('')
    console.log(`city column exists: ${hasCity ? '✅' : '❌'}`)
    console.log(`state column exists: ${hasState ? '✅' : '❌'}`)
    console.log(`zip column exists: ${hasZip ? '✅' : '❌'}`)

    if (hasCity && hasState && hasZip) {
      console.log('')
      console.log('🎉 All columns already exist! Migration not needed.')
    } else {
      console.log('')
      console.log('⚠️  Columns missing - migration required!')
      console.log('Run the SQL in Supabase Dashboard SQL Editor.')
    }
  }
}

runMigration().catch(console.error)
