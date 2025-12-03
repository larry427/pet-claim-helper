const { Client } = require('pg')
const fs = require('fs')
const readline = require('readline')
require('dotenv').config({ path: '.env.local' })

async function runMigration() {
  console.log('🔧 Database Migration: Add address columns\n')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL not found')
    process.exit(1)
  }

  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  console.log(`Project: ${projectRef}\n`)

  // Try common password env var names
  let password = process.env.SUPABASE_DB_PASSWORD ||
                 process.env.DATABASE_PASSWORD ||
                 process.env.POSTGRES_PASSWORD ||
                 process.env.DB_PASSWORD

  if (!password) {
    // Prompt for password
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    password = await new Promise(resolve => {
      rl.question('Enter Supabase database password: ', answer => {
        rl.close()
        resolve(answer.trim())
      })
    })

    if (!password) {
      console.error('❌ Password required')
      process.exit(1)
    }
  }

  const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('✅ Connected!\n')

    const sql = fs.readFileSync('add-address-columns.sql', 'utf8')
    console.log('📄 SQL:')
    console.log(sql)
    console.log('')

    await client.query(sql)
    console.log('✅ Migration executed!\n')

    // Verify
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      AND column_name IN ('city', 'state', 'zip')
      ORDER BY column_name
    `)

    console.log('✅ Verification - columns added:')
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
