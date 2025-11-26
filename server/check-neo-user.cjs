const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkNeoUser() {
  console.log('\n=== CHECKING NEO USER ID ===\n')
  
  const { data: neo, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', '91e0b25a-0f3a-40de-a851-fcc0d98ebbf6')
    .single()
    
  if (error) {
    console.error('Error:', error.message)
    return
  }
  
  console.log('Neo found:')
  console.log('  ID:', neo.id)
  console.log('  Name:', neo.name)
  console.log('  User ID:', neo.user_id)
  console.log('\nExpected user ID: b7486f8d-c69f-4069-acfd-a6cb22bdd664')
  console.log('Match:', neo.user_id === 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' ? '✅ YES' : '❌ NO')
}

checkNeoUser()
