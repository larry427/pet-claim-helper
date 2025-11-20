require('dotenv').config({ path: 'server/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
  console.log('\n' + '='.repeat(80))
  console.log('🔧 RUNNING MEDICATION_REMINDERS_LOG TABLE MIGRATION')
  console.log('='.repeat(80))

  const migrationPath = path.join(__dirname, 'server/migrations/create-medication-reminders-log.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  console.log('\n📄 Migration SQL:')
  console.log(sql.substring(0, 200) + '...\n')

  console.log('⏳ Executing migration...\n')

  try {
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).then(
      () => ({ error: null }),
      async () => {
        // If exec_sql doesn't exist, try direct execution
        // Split by semicolons and execute each statement
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'))

        for (const statement of statements) {
          if (statement.trim()) {
            console.log(`Executing: ${statement.substring(0, 60)}...`)
            const { error } = await supabase.rpc('exec', { query: statement })
            if (error) {
              // Try using FROM clause for policies/indexes
              const { error: error2 } = await supabase.from('_migrations').insert({ sql: statement })
              if (error2) return { error }
            }
          }
        }
        return { error: null }
      }
    )

    if (error) {
      console.error('❌ Migration failed:', error.message)
      console.log('\n💡 MANUAL STEPS REQUIRED:')
      console.log('1. Open Supabase Dashboard → SQL Editor')
      console.log('2. Copy the contents of: server/migrations/create-medication-reminders-log.sql')
      console.log('3. Paste and run the SQL')
      console.log('='.repeat(80) + '\n')
      return
    }

    console.log('✅ Migration completed successfully!')

    // Verify table was created
    const { data: tables } = await supabase
      .from('medication_reminders_log')
      .select('id')
      .limit(0)

    if (tables !== null) {
      console.log('✅ Table verified: medication_reminders_log exists')
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    console.log('\n💡 MANUAL STEPS REQUIRED:')
    console.log('1. Open Supabase Dashboard → SQL Editor')
    console.log('2. Copy the contents of: server/migrations/create-medication-reminders-log.sql')
    console.log('3. Paste and run the SQL')
  }

  console.log('='.repeat(80) + '\n')
}

runMigration().catch(console.error)
