require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkNationwideClaims() {
  console.log('🔍 Checking Nationwide claims...\n')
  
  // Get Nationwide pet IDs
  const { data: nwPets } = await supabase
    .from('pets')
    .select('id, name, policy_number')
    .ilike('insurance_company', '%nationwide%')
  
  const petIds = nwPets.map(p => p.id)
  
  // Get claims for these pets
  const { data: claims, error } = await supabase
    .from('claims')
    .select('id, pet_id, created_at, total_amount, status')
    .in('pet_id', petIds)
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('❌ Error:', error)
    return
  }
  
  if (!claims || claims.length === 0) {
    console.log('❌ No claims found for Nationwide pets')
    return
  }
  
  console.log(`✅ Found ${claims.length} Nationwide claim(s):\n`)
  claims.forEach(claim => {
    const pet = nwPets.find(p => p.id === claim.pet_id)
    console.log(`   Claim ID: ${claim.id}`)
    console.log(`   Pet: ${pet?.name} (Policy: "${pet?.policy_number}")`)
    console.log(`   Amount: $${claim.total_amount}`)
    console.log(`   Status: ${claim.status}`)
    console.log(`   Created: ${claim.created_at}`)
    console.log()
  })
  
  // Show the most recent one for testing
  const latestClaim = claims[0]
  const latestPet = nwPets.find(p => p.id === latestClaim.pet_id)
  console.log('\n🎯 Latest claim for testing:')
  console.log(`   Claim ID: ${latestClaim.id}`)
  console.log(`   Pet: ${latestPet.name}`)
  console.log(`   Policy #: ${latestPet.policy_number}`)
}

checkNationwideClaims()
