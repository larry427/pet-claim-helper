const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugNameField() {
  console.log('🔍 DEBUGGING NAME FIELD DATA FLOW')
  console.log('='.repeat(80))

  // Find the test-automation user
  const testEmail = 'test-automation@petclaimhelper.com'

  console.log(`\n1️⃣ Checking profile for: ${testEmail}`)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', testEmail)

  if (profileError) {
    console.error('❌ Error fetching profile:', profileError)
    return
  }

  if (!profiles || profiles.length === 0) {
    console.log('❌ No profile found for test-automation user')
    return
  }

  const profile = profiles[0]
  console.log('\n✅ Profile found:')
  console.log('   User ID:', profile.id)
  console.log('   Email:', profile.email)
  console.log('   Full Name:', profile.full_name || '(null)')

  // Check recent claims for this user
  console.log(`\n2️⃣ Checking recent claims...`)
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('id, created_at, clinic_name')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(3)

  if (claimsError) {
    console.error('❌ Error fetching claims:', claimsError)
    return
  }

  console.log(`\n✅ Found ${claims?.length || 0} recent claims`)
  if (claims && claims.length > 0) {
    claims.forEach((claim, idx) => {
      console.log(`\n   Claim #${idx + 1}:`)
      console.log(`   - ID: ${claim.id}`)
      console.log(`   - Created: ${claim.created_at}`)
      console.log(`   - Clinic: ${claim.clinic_name || '(null)'}`)
    })
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY:')
  console.log(`Profile full_name: ${profile.full_name ? '✅ EXISTS' : '❌ NULL'}`)
  console.log(`Value: "${profile.full_name || 'null'}"`)

  if (!profile.full_name) {
    console.log('\n⚠️  ISSUE: full_name is NULL - this is why email is used instead!')
    console.log('The save operation in server/index.js may not be working correctly.')
  } else {
    console.log('\n✅ full_name is set in database')
    console.log('If PDFs still show email, check PDF generation code.')
  }

  console.log('\n' + '='.repeat(80))
}

debugNameField().catch(console.error)
