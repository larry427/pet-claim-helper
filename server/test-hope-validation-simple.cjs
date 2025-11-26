const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function testValidation() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING POLICY NUMBER VALIDATION LOGIC')
  console.log('='.repeat(80) + '\n')
  
  // Get Hope
  const { data: hope } = await supabase
    .from('pets')
    .select('id, name, policy_number, insurance_company')
    .eq('name', 'Hope')
    .single()
  
  console.log('📋 Hope\'s data:')
  console.log('   Policy Number:', JSON.stringify(hope.policy_number))
  console.log('   Is empty string:', hope.policy_number === '')
  console.log('   Is falsy:', !hope.policy_number)
  console.log()
  
  // Simulate field validation logic
  const petData = { policy_number: hope.policy_number }
  const fieldValue = petData?.policy_number
  
  console.log('🔍 Validation check:')
  console.log('   petData.policy_number:', JSON.stringify(fieldValue))
  console.log('   Is missing (empty/null/undefined):', !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined)
  console.log()
  
  if (!fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined) {
    console.log('✅ Policy number WILL be flagged as missing')
    console.log('   → User will see: "What is your pet insurance policy number?"')
  } else {
    console.log('❌ Policy number will NOT be flagged as missing')
  }
  
  console.log('\n' + '='.repeat(80))
}

testValidation()
