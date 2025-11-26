require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

async function runMigration() {
  console.log('='.repeat(80))
  console.log('RUNNING MIGRATION: Add healthy_paws_pet_id column')
  console.log('='.repeat(80))
  console.log('')

  const sql = fs.readFileSync('add-hp-pet-id-migration.sql', 'utf8')
  
  console.log('SQL to execute:')
  console.log(sql)
  console.log('')
  console.log('Executing...')
  console.log('')

  const { data, error } = await supabase.rpc('exec_sql', { sql })

  if (error) {
    console.error('ERROR running migration:', error)
    
    // Try alternative approach using direct query
    console.log('')
    console.log('Trying alternative approach...')
    const { error: altError } = await supabase
      .from('pets')
      .select('id')
      .limit(1)
    
    if (altError) {
      console.error('Cannot access pets table:', altError)
    } else {
      console.log('Note: Column might already exist or need manual SQL execution')
      console.log('You may need to run this SQL in Supabase SQL Editor:')
      console.log('')
      console.log(sql)
    }
    return
  }

  console.log('SUCCESS! Migration completed')
  console.log('')
  
  // Verify the column was added
  console.log('Verifying column was added...')
  const { data: pets, error: verifyError } = await supabase
    .from('pets')
    .select('id, name, healthy_paws_pet_id')
    .limit(1)

  if (verifyError) {
    console.error('ERROR verifying column:', verifyError.message)
  } else {
    console.log('VERIFIED! healthy_paws_pet_id column exists')
    console.log('Sample:', pets[0])
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
