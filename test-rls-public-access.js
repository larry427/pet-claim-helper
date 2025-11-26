import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY // Use ANON key (public)

async function testPublicAccess() {
  console.log('🔍 TESTING PUBLIC ACCESS TO medication_doses')
  console.log('='.repeat(80))
  console.log('Using ANON key (simulating unauthenticated user)')
  console.log('Supabase URL:', supabaseUrl)
  console.log('Anon key:', supabaseKey?.slice(0, 20) + '...')

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test 1: Can we query medication_doses with a token?
  console.log('\n📋 TEST 1: Query by one_time_token (public access)')
  console.log('-'.repeat(80))

  // Get a valid token from the database first
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: sampleDose } = await supabaseAdmin
    .from('medication_doses')
    .select('one_time_token')
    .not('one_time_token', 'is', null)
    .limit(1)
    .single()

  if (!sampleDose?.one_time_token) {
    console.log('❌ No doses with tokens found. Create a medication to test.')
    return
  }

  const testToken = sampleDose.one_time_token
  console.log('Test token:', testToken)

  // Now try to query as public user
  const { data, error } = await supabase
    .from('medication_doses')
    .select('*, medications(*, pets(name, species))')
    .eq('one_time_token', testToken)
    .eq('status', 'pending')
    .single()

  if (error) {
    console.log('❌ PUBLIC ACCESS DENIED')
    console.log('Error:', error.message)
    console.log('Code:', error.code)
    console.log('Details:', error.details)
    console.log('\n🚨 THIS IS THE PROBLEM!')
    console.log('RLS policy is blocking public access to medication_doses.')
    console.log('You need to run: add-token-rls-policy.sql')
  } else if (data) {
    console.log('✅ PUBLIC ACCESS WORKS!')
    console.log('Dose ID:', data.id)
    console.log('Medication:', data.medications?.medication_name)
    console.log('Pet:', data.medications?.pets?.name)
    console.log('\n✅ Magic link authentication should work!')
  } else {
    console.log('⚠️  Query succeeded but returned no data')
  }

  // Test 2: Try to query without token (should fail or return nothing)
  console.log('\n\n📋 TEST 2: Query without token (should be empty)')
  console.log('-'.repeat(80))

  const { data: allDoses, error: allError } = await supabase
    .from('medication_doses')
    .select('*')
    .limit(5)

  if (allError) {
    console.log('❌ Error:', allError.message)
  } else {
    console.log(`Returned ${allDoses?.length || 0} doses`)
    if (allDoses && allDoses.length > 0) {
      console.log('⚠️  WARNING: Public can see all doses! This might be too permissive.')
    } else {
      console.log('✅ No doses returned (expected - RLS working)')
    }
  }

  console.log('\n' + '='.repeat(80))
}

testPublicAccess().catch(console.error)
