const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

// Import the validation function
const { getMissingRequiredFields, getRequiredFieldsForInsurer } = require('./server/lib/claimFormMappings.js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function testHopePolicyValidation() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING HOPE POLICY NUMBER VALIDATION')
  console.log('='.repeat(80) + '\n')
  
  // Get Hope's data
  const { data: hope, error: hopeError } = await supabase
    .from('pets')
    .select('*')
    .eq('name', 'Hope')
    .single()
  
  if (hopeError || !hope) {
    console.error('❌ Error fetching Hope:', hopeError)
    return
  }
  
  console.log('📋 Hope\'s current data:')
  console.log('   ID:', hope.id)
  console.log('   Name:', hope.name)
  console.log('   Insurance:', hope.insurance_company)
  console.log('   Policy Number:', JSON.stringify(hope.policy_number))
  console.log('   Is empty:', hope.policy_number === '')
  console.log()
  
  // Get a claim for Hope
  const { data: claims, error: claimError } = await supabase
    .from('claims')
    .select('*')
    .eq('pet_id', hope.id)
    .limit(1)
  
  if (claimError || !claims || claims.length === 0) {
    console.error('❌ No claims found for Hope')
    return
  }
  
  const claim = claims[0]
  console.log('📄 Hope\'s claim:')
  console.log('   Claim ID:', claim.id)
  console.log('   Amount:', claim.total_amount)
  console.log()
  
  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', claim.user_id)
    .single()
  
  if (profileError || !profile) {
    console.error('❌ Error fetching profile:', profileError)
    return
  }
  
  console.log('👤 User profile:')
  console.log('   Has signature:', !!profile.signature)
  console.log('   Has phone:', !!profile.phone)
  console.log()
  
  // Check required fields for Trupanion
  console.log('🔍 Checking required fields for Trupanion...\n')
  
  const requiredFields = getRequiredFieldsForInsurer('Trupanion')
  console.log(`📋 Total required fields: ${requiredFields.length}`)
  
  const policyField = requiredFields.find(f => f.field === 'policyNumber')
  if (policyField) {
    console.log('\n✅ Policy Number field is in required fields:')
    console.log('   Field:', policyField.field)
    console.log('   Source:', policyField.source)
    console.log('   Required:', policyField.required)
    console.log('   Prompt:', policyField.prompt)
  } else {
    console.log('\n❌ Policy Number NOT in required fields!')
  }
  
  // Get missing fields
  const missingFields = getMissingRequiredFields('Trupanion', profile, hope, claim)
  
  console.log(`\n📊 Missing fields: ${missingFields.length}`)
  missingFields.forEach(field => {
    console.log(`   - ${field.field} (${field.source}): "${field.prompt}"`)
  })
  
  const missingPolicy = missingFields.find(f => f.field === 'policyNumber')
  if (missingPolicy) {
    console.log('\n✅ Policy Number IS flagged as missing (correct!)')
    console.log('   User will be prompted:', missingPolicy.prompt)
  } else {
    console.log('\n❌ Policy Number NOT flagged as missing (bug!)')
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('🎯 RESULT: Policy number validation is', missingPolicy ? 'WORKING ✅' : 'BROKEN ❌')
  console.log('='.repeat(80) + '\n')
}

testHopePolicyValidation()
