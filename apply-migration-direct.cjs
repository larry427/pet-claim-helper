// Apply migration using direct Supabase connection
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyMigration() {
  console.log('\n=== APPLYING MEDICATION REMINDERS SCHEMA FIX ===\n')

  try {
    // Step 1: Add message_id column
    console.log('Step 1: Adding message_id column...')
    // We'll do this via a dummy query to check if it exists
    const { data: sample, error: sampleError } = await supabase
      .from('medication_reminders_log')
      .select('*')
      .limit(1)

    if (sample?.[0]) {
      const hasMessageId = 'message_id' in sample[0]
      const hasSentAt = 'sent_at' in sample[0]

      console.log(`  message_id: ${hasMessageId ? '✓ EXISTS' : '✗ MISSING'}`)
      console.log(`  sent_at: ${hasSentAt ? '✓ EXISTS' : '✗ MISSING'}`)

      if (!hasMessageId || !hasSentAt) {
        console.log('\n  ⚠️  Columns missing - need to add them via Supabase Dashboard')
      }
    }

    // Step 2: Find and report duplicates
    console.log('\nStep 2: Finding duplicate entries...')

    const { data: allLogs } = await supabase
      .from('medication_reminders_log')
      .select('id, medication_id, reminder_date, reminder_time, created_at')
      .order('created_at')

    const seen = new Map()
    const duplicatesToDelete = []

    allLogs?.forEach(log => {
      const key = `${log.medication_id}-${log.reminder_date}-${log.reminder_time}`
      if (seen.has(key)) {
        // This is a duplicate - mark for deletion (keep the earlier one)
        duplicatesToDelete.push(log.id)
        console.log(`  Found duplicate: ${log.reminder_date} ${log.reminder_time} (${log.id})`)
      } else {
        seen.set(key, log)
      }
    })

    console.log(`\n  Total duplicates found: ${duplicatesToDelete.length}`)

    if (duplicatesToDelete.length > 0) {
      console.log('\nStep 3: Deleting duplicate entries...')

      const { error: deleteError } = await supabase
        .from('medication_reminders_log')
        .delete()
        .in('id', duplicatesToDelete)

      if (deleteError) {
        console.error('  ✗ Error deleting duplicates:', deleteError.message)
      } else {
        console.log(`  ✓ Deleted ${duplicatesToDelete.length} duplicate entries`)
      }
    } else {
      console.log('\nStep 3: No duplicates to delete ✓')
    }

    // Step 4: Verify we can now enforce uniqueness
    console.log('\nStep 4: Testing uniqueness (without constraint yet)...')
    console.log('  Note: Constraint must be added via SQL Editor')

    console.log('\n' + '='.repeat(60))
    console.log('MANUAL STEPS REQUIRED')
    console.log('='.repeat(60))
    console.log('\n1. Go to Supabase Dashboard → SQL Editor')
    console.log('   https://supabase.com/dashboard/project/_/sql')
    console.log('\n2. Run this SQL:\n')

    const sql = fs.readFileSync('fix-medication-reminders-schema.sql', 'utf8')
    console.log('```sql')
    console.log(sql)
    console.log('```')

    console.log('\n3. Verify by running:')
    console.log('   node count-duplicates.cjs')
    console.log('\n' + '='.repeat(60))

  } catch (error) {
    console.error('\n✗ Error:', error.message)
  }

  console.log('\n')
}

applyMigration()
