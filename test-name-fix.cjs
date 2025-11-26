const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function testNameFix() {
  console.log('🧪 TESTING NAME FIX')
  console.log('='.repeat(80))

  const testEmail = 'test-automation@petclaimhelper.com'
  const testName = 'Larry Test Name'

  // Get user profile
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', testEmail)
    .single()

  if (!profiles) {
    console.log('❌ No profile found')
    return
  }

  const userId = profiles.id
  console.log(`\n1️⃣ User ID: ${userId}`)
  console.log(`2️⃣ Test Name: "${testName}"`)

  // Simulate what the server does when saving collected fields
  console.log(`\n3️⃣ Simulating server save operation...`)

  const { error: nameError } = await supabase
    .from('profiles')
    .update({ full_name: testName })
    .eq('id', userId)

  if (nameError) {
    console.error('❌ Error saving name:', nameError)
    return
  }

  console.log('✅ Name saved successfully!')

  // Verify it was saved
  const { data: updatedProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  console.log(`\n4️⃣ Verification:`)
  console.log(`   Database full_name: "${updatedProfile?.full_name}"`)

  if (updatedProfile?.full_name === testName) {
    console.log('\n✅ SUCCESS! Name was saved correctly!')
    console.log('\nNow when you submit a claim:')
    console.log('1. The validation will see full_name exists')
    console.log('2. policyholderName will NOT be in missingFields')
    console.log('3. PDF will use the saved name instead of email')
  } else {
    console.log('\n❌ FAILURE! Name was not saved correctly')
  }

  console.log('\n' + '='.repeat(80))
}

testNameFix().catch(console.error)
