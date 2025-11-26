const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('STEP 1: CHECKING CURRENT DATABASE SCHEMA')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // Check pets table columns
  const { data: petsColumns, error: petsError } = await supabase
    .rpc('exec_sql', {
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'pets' 
        ORDER BY ordinal_position;
      `
    })
  
  if (petsError) {
    console.error('❌ Error querying pets table:', petsError)
  } else {
    console.log('📋 PETS TABLE - Current Columns:')
    console.log(JSON.stringify(petsColumns, null, 2))
  }
  
  // Check profiles table columns
  const { data: profilesColumns, error: profilesError } = await supabase
    .rpc('exec_sql', {
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        ORDER BY ordinal_position;
      `
    })
  
  if (profilesError) {
    console.error('❌ Error querying profiles table:', profilesError)
  } else {
    console.log('\n📋 PROFILES TABLE - Current Columns:')
    console.log(JSON.stringify(profilesColumns, null, 2))
  }
}

checkSchema()
