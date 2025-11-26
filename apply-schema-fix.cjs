// Apply the schema fix to medication_reminders_log
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyFix() {
  console.log('\n=== APPLYING SCHEMA FIX ===\n')

  // Read the SQL file
  const sql = fs.readFileSync('fix-medication-reminders-schema.sql', 'utf8')

  console.log('Executing SQL migration...\n')

  // We need to execute each statement separately
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  for (const statement of statements) {
    if (!statement) continue

    console.log(`Executing: ${statement.substring(0, 100)}...`)

    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: statement
    }).catch(async () => {
      // If RPC doesn't exist, we need to use a different approach
      // Unfortunately, Supabase client doesn't support raw SQL
      // We'll need to do this via Supabase dashboard or psql
      console.log('  ⚠️  Cannot execute via Supabase client - need direct database access')
      return { error: { message: 'RPC not available' } }
    })

    if (error) {
      // Some errors are ok (like column already exists)
      if (error.message?.includes('already exists')) {
        console.log('  ✓ Already exists, skipping')
      } else {
        console.log('  ✗ Error:', error.message)
      }
    } else {
      console.log('  ✓ Success')
    }
  }

  console.log('\n=== MANUAL STEPS REQUIRED ===\n')
  console.log('Since we cannot execute raw SQL via Supabase client, you need to:')
  console.log('')
  console.log('1. Go to Supabase Dashboard → SQL Editor')
  console.log('2. Copy and paste the contents of: fix-medication-reminders-schema.sql')
  console.log('3. Click "Run"')
  console.log('')
  console.log('OR use psql:')
  console.log('  psql $DATABASE_URL -f fix-medication-reminders-schema.sql')
  console.log('')

  // Verify current state
  console.log('=== CURRENT STATE ===\n')

  const { data: sample } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .limit(1)

  if (sample?.[0]) {
    console.log('Current columns:', Object.keys(sample[0]))
    console.log('')
    const hasMsgId = 'message_id' in sample[0]
    const hasSentAt = 'sent_at' in sample[0]
    console.log(`message_id column: ${hasMsgId ? '✓ EXISTS' : '✗ MISSING'}`)
    console.log(`sent_at column: ${hasSentAt ? '✓ EXISTS' : '✗ MISSING'}`)
  }

  // Check for duplicates
  const { data: duplicates } = await supabase.rpc('find_duplicate_reminders')
    .catch(() => ({ data: null }))

  if (!duplicates) {
    // Manual check
    const { data: logs } = await supabase
      .from('medication_reminders_log')
      .select('medication_id, reminder_date, reminder_time')

    const seen = new Map()
    const dupes = []

    logs?.forEach(log => {
      const key = `${log.medication_id}-${log.reminder_date}-${log.reminder_time}`
      if (seen.has(key)) {
        dupes.push(log)
      } else {
        seen.set(key, true)
      }
    })

    console.log(`\nDuplicate entries found: ${dupes.length}`)
    if (dupes.length > 0) {
      console.log('⚠️  These will be cleaned up by the migration')
    }
  }

  console.log('\n')
}

applyFix()
