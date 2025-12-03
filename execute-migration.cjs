const { Client } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

async function executeMigration() {
  console.log('🔧 Executing address columns migration...\n')

  // Supabase connection string format:
  // postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const dbPassword = process.env.SUPABASE_DB_PASSWORD

  if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL not found in .env.local')
    process.exit(1)
  }

  // Extract project ref from URL: https://hyrgqrgeshkgvsfwnzzu.supabase.co
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

  if (!projectRef) {
    console.error('❌ Could not extract project ref from SUPABASE_URL:', supabaseUrl)
    process.exit(1)
  }

  console.log(`📊 Project ref: ${projectRef}`)

  if (!dbPassword) {
    console.error('❌ SUPABASE_DB_PASSWORD not found in .env.local')
    console.log('\n📋 Please add SUPABASE_DB_PASSWORD to .env.local')
    console.log('You can find it in Supabase Dashboard > Project Settings > Database > Connection String')
    process.exit(1)
  }

  const connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('✅ Connected!\n')

    // Read SQL file
    const sql = fs.readFileSync('add-address-columns.sql', 'utf8')

    console.log('📄 Executing SQL:')
    console.log(sql)
    console.log('')

    // Execute migration
    await client.query(sql)
    console.log('✅ Migration executed successfully!\n')

    // Verify columns were added
    console.log('🔍 Verifying columns...')
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      AND column_name IN ('city', 'state', 'zip')
      ORDER BY column_name
    `)

    if (result.rows.length === 3) {
      console.log('✅ All 3 columns verified:')
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`)
      })
    } else {
      console.log('⚠️  Expected 3 columns, found:', result.rows.length)
      console.log(result.rows)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await client.end()
    console.log('\n🔌 Database connection closed')
  }
}

executeMigration()
