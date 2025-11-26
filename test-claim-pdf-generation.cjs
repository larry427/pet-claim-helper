/**
 * Test script to verify PDF generation fixes
 * Tests:
 * 1. Policy number from pets table
 * 2. Body part extraction from diagnosis
 * 3. Signature embedding
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testClaimPDFGeneration() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING CLAIM PDF GENERATION')
  console.log('='.repeat(80) + '\n')

  try {
    // 1. Find a claim with diagnosis containing "ear"
    console.log('1️⃣  Finding test claim in database...')
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select(`
        *,
        pets (
          id,
          name,
          species,
          policy_number,
          user_id
        )
      `)
      .not('diagnosis', 'is', null)
      .limit(10)

    if (claimsError) {
      console.error('❌ Error fetching claims:', claimsError)
      return
    }

    console.log(`   Found ${claims.length} claims`)

    // Find one with "ear" in diagnosis
    let testClaim = claims.find(c => c.diagnosis?.toLowerCase().includes('ear'))

    if (!testClaim && claims.length > 0) {
      // Use first claim if none have "ear"
      testClaim = claims[0]
    }

    if (!testClaim) {
      console.error('❌ No claims found in database')
      return
    }

    console.log(`   ✅ Using claim ID: ${testClaim.id}`)
    console.log(`   Pet: ${testClaim.pets.name}`)
    console.log(`   Diagnosis: ${testClaim.diagnosis}`)
    console.log(`   Policy Number (from pets): ${testClaim.pets.policy_number}`)

    // 2. Get user profile
    console.log('\n2️⃣  Fetching user profile...')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testClaim.pets.user_id)
      .single()

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError)
      return
    }

    console.log(`   ✅ User: ${profile.full_name || profile.email}`)
    console.log(`   Signature exists: ${profile.signature ? 'YES' : 'NO'}`)
    if (profile.signature) {
      console.log(`   Signature length: ${profile.signature.length} chars`)
      console.log(`   Signature format: ${profile.signature.substring(0, 30)}...`)
    }

    // 3. Call the submit endpoint
    console.log('\n3️⃣  Calling submit endpoint...')
    console.log(`   POST http://localhost:8787/api/claims/submit`)
    console.log(`   Body: { claimId: "${testClaim.id}", userId: "${testClaim.pets.user_id}" }`)

    const response = await fetch('http://localhost:8787/api/claims/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        claimId: testClaim.id,
        userId: testClaim.pets.user_id
      })
    })

    console.log(`   Response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Submit failed: ${errorText}`)
      return
    }

    const result = await response.json()
    console.log(`   ✅ Result:`, result)

    // 4. Check the debug logs
    console.log('\n4️⃣  Waiting 2 seconds for backend logs to appear...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('\n' + '='.repeat(80))
    console.log('✅ TEST COMPLETE')
    console.log('='.repeat(80))
    console.log('Check the backend server logs above for:')
    console.log('  - 🔍 DEBUG: CLAIM DATA EXTRACTION')
    console.log('  - 📦 DEBUG: CLAIM DATA OBJECT FOR PDF')
    console.log('  - 🔍 DEBUG: getValueForField')
    console.log('  - 🖊️  Embedding signature image')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ Test failed with error:', error)
    console.error(error.stack)
  }
}

testClaimPDFGeneration()
