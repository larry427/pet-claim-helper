import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration(migrationFile) {
  console.log(`📝 Running migration: ${migrationFile}`)
  console.log('='.repeat(80))

  const filePath = path.join(__dirname, 'migrations', migrationFile)

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Migration file not found: ${filePath}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(filePath, 'utf8')

  console.log('SQL to execute:')
  console.log(sql)
  console.log('')
  console.log('='.repeat(80))

  try {
    // Execute the SQL via Supabase
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      console.error('❌ Migration failed:', error.message)
      console.error('Full error:', JSON.stringify(error, null, 2))
      process.exit(1)
    }

    console.log('✅ Migration completed successfully!')
    if (data) {
      console.log('Result:', data)
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err.message)
    process.exit(1)
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2]

if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file.sql>')
  console.error('\nExample: node run-migration.js add-claim-submission-tracking.sql')
  console.error('\nAvailable migrations:')
  const files = fs.readdirSync(path.join(__dirname, 'migrations'))
  files.forEach(f => console.error(`  - ${f}`))
  process.exit(1)
}

runMigration(migrationFile)
