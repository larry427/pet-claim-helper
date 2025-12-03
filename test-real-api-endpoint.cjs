const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

async function testRealAPIEndpoint() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING REAL API ENDPOINT: POST /api/claims/submit')
  console.log('='.repeat(80))
  console.log()

  try {
    // Step 1: Login as Larry
    console.log('Step 1: Logging in as larry@uglydogadventures.com...')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'larry@uglydogadventures.com',
      password: process.env.TEST_PASSWORD || 'your-password'
    })

    if (authError) {
      console.error('❌ Login failed:', authError.message)
      return
    }

    const token = authData.session.access_token
    const userId = authData.user.id
    console.log('✅ Logged in, user ID:', userId)

    // Step 2: Find a Pumpkin claim
    console.log('\nStep 2: Finding a Pumpkin claim...')
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select(`
        id,
        pets (
          name,
          insurance_company
        )
      `)
      .eq('user_id', userId)

    if (claimsError) {
      console.error('❌ Error fetching claims:', claimsError.message)
      return
    }

    const pumpkinClaim = claims?.find(c =>
      c.pets?.insurance_company?.toLowerCase().includes('pumpkin')
    )

    if (!pumpkinClaim) {
      console.log('❌ No Pumpkin claims found. Creating test claim...')
      console.log('You need to manually create a Pumpkin claim in the UI first.')
      return
    }

    console.log('✅ Found Pumpkin claim:', pumpkinClaim.id, 'for', pumpkinClaim.pets.name)

    // Step 3: Call the REAL API endpoint
    console.log('\nStep 3: Calling POST /api/claims/submit...')
    console.log('This will trigger server-side logging with debug output.')

    const response = await fetch('http://localhost:8787/api/claims/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        claimId: pumpkinClaim.id,
        userId: userId
      })
    })

    const result = await response.json()

    console.log('\n' + '='.repeat(80))
    console.log('API RESPONSE:')
    console.log('='.repeat(80))
    console.log('Status:', response.status)
    console.log('Result:', JSON.stringify(result, null, 2))
    console.log('='.repeat(80))

    if (response.ok) {
      console.log('\n✅ SUCCESS! Check the server logs above for debug output.')
      console.log('Look for lines starting with "🔍 PUMPKIN DATA FIELDS:"')
    } else {
      console.log('\n❌ API call failed')
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)
  }
}

testRealAPIEndpoint().catch(console.error)
