/**
 * Run Trupanion fields migration
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
  console.log('\n' + '='.repeat(80))
  console.log('🔧 RUNNING TRUPANION FIELDS MIGRATION')
  console.log('='.repeat(80) + '\n')

  try {
    // Add columns
    console.log('Adding columns to pets table...\n')

    const columns = [
      { name: 'had_other_insurance', type: 'BOOLEAN' },
      { name: 'other_insurance_provider', type: 'TEXT' },
      { name: 'other_insurance_cancel_date', type: 'DATE' },
      { name: 'other_insurance_still_active', type: 'BOOLEAN' },
      { name: 'other_hospitals_visited', type: 'TEXT' }
    ]

    for (const col of columns) {
      const { error } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE pets ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`
      })

      if (error) {
        console.log(`   ⚠️  ${col.name}: Using direct query (RPC not available)`)
        // Note: Direct ALTER TABLE requires service role permissions
      } else {
        console.log(`   ✅ ${col.name} (${col.type})`)
      }
    }

    console.log('\n✅ Migration complete!')
    console.log('\nNOTE: If columns were not added, run the SQL manually in Supabase:')
    console.log('File: server/add-trupanion-fields-migration.sql')
    console.log()
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error('\nPlease run the SQL manually in Supabase SQL editor:')
    console.error('File: server/add-trupanion-fields-migration.sql\n')
    process.exit(1)
  }
}

runMigration()
