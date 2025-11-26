const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function testNeoPolicyFlow() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING NEO POLICY NUMBER FLOW')
  console.log('='.repeat(80) + '\n')
  
  // Step 1: Get Neo's claim data (matching server/index.js line 1128)
  const claimId = '51ee2d24-9da1-46b8-8750-84415e1243bf' // Neo's latest claim
  
  console.log('📥 Step 1: Query claim data from database')
  console.log(`   Claim ID: ${claimId}\n`)
  
  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .select(`
      *,
      pets (
        name,
        species,
        breed,
        date_of_birth,
        policy_number,
        insurance_company
      )
    `)
    .eq('id', claimId)
    .single()
  
  if (claimError || !claim) {
    console.error('❌ Error fetching claim:', claimError)
    return
  }
  
  console.log('✅ Database returned:')
  console.log('   claim.pets.policy_number:', JSON.stringify(claim.pets.policy_number))
  console.log('   Type:', typeof claim.pets.policy_number)
  console.log('   === null:', claim.pets.policy_number === null)
  console.log('   === "":', claim.pets.policy_number === '')
  console.log('   === undefined:', claim.pets.policy_number === undefined)
  console.log()
  
  // Step 2: Build claimData object (matching server/index.js line 1226)
  console.log('📦 Step 2: Build claimData object')
  const claimData = {
    policyNumber: claim.pets.policy_number || 'N/A',
    petName: claim.pets.name,
    // ... other fields
  }
  
  console.log('   claimData.policyNumber:', JSON.stringify(claimData.policyNumber))
  console.log('   Result of OR operation:')
  console.log('     claim.pets.policy_number || "N/A" =', claim.pets.policy_number || 'N/A')
  console.log()
  
  // Step 3: Simulate getValueForField (matching generateClaimPDF.js line 335)
  console.log('🔍 Step 3: Simulate getValueForField')
  const fieldMap = {
    policyNumber: claimData.policyNumber
  }
  const value = fieldMap['policyNumber']
  console.log('   fieldMap.policyNumber:', JSON.stringify(value))
  console.log('   Type:', typeof value)
  console.log()
  
  // Step 4: Simulate skip check (matching generateClaimPDF.js line 102)
  console.log('⚖️  Step 4: Check if field would be skipped')
  const wouldSkip = !value && value !== false
  console.log('   Condition: !value && value !== false')
  console.log('     !value =', !value)
  console.log('     value !== false =', value !== false)
  console.log('   Result: Field would be SKIPPED =', wouldSkip)
  console.log()
  
  // Step 5: Show what PDF field name would be used
  console.log('📄 Step 5: PDF field mapping')
  const FORM_FIELD_MAPPINGS = {
    nationwide: {
      policyNumber: 'Policy number'
    }
  }
  console.log('   Our field name: policyNumber')
  console.log('   PDF field name:', FORM_FIELD_MAPPINGS.nationwide.policyNumber)
  console.log('   Value to write:', JSON.stringify(value))
  console.log()
  
  // Final verdict
  console.log('='.repeat(80))
  if (wouldSkip) {
    console.log('❌ BUG FOUND: Field would be SKIPPED')
    console.log('   Reason: value is falsy but not exactly false')
  } else {
    console.log('✅ Field would be FILLED')
    console.log(`   PDF field "Policy number" would receive: "${value}"`)
  }
  console.log('='.repeat(80) + '\n')
}

testNeoPolicyFlow()
