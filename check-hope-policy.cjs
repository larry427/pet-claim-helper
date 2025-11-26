require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkHopePolicy() {
  console.log('🔍 Checking Hope\'s policy number...\n')
  
  const { data: pets, error } = await supabase
    .from('pets')
    .select('id, name, policy_number, insurance_company')
    .eq('name', 'Hope')
  
  if (error) {
    console.error('❌ Error:', error)
    return
  }
  
  if (!pets || pets.length === 0) {
    console.log('❌ No pet named Hope found')
    return
  }
  
  const hope = pets[0]
  console.log('✅ Found Hope:')
  console.log('   ID:', hope.id)
  console.log('   Name:', hope.name)
  console.log('   Insurance Company:', hope.insurance_company)
  console.log('   Policy Number:', hope.policy_number)
  console.log('   Policy Number Type:', typeof hope.policy_number)
  console.log('   Policy Number === null:', hope.policy_number === null)
  console.log('   Policy Number === undefined:', hope.policy_number === undefined)
  console.log('   Policy Number === "":', hope.policy_number === '')
  console.log('   Policy Number === "N/A":', hope.policy_number === 'N/A')
}

checkHopePolicy()
