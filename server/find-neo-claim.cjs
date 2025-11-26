const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findNeoClaim() {
  console.log('\n=== FINDING NEO AND HIS TRUPANION CLAIM ===\n')
  
  // Find Neo
  const { data: neo, error: neoError } = await supabase
    .from('pets')
    .select('*')
    .eq('id', '91e0b25a-0f3a-40de-a851-fcc0d98ebbf6')
    .single()
    
  if (neoError) {
    console.error('Error finding Neo:', neoError.message)
    return
  }
  
  console.log('Neo:')
  console.log('  ID:', neo.id)
  console.log('  Name:', neo.name)
  console.log('  Insurance:', neo.insurance_company)
  console.log('  Policy #:', neo.policy_number)
  console.log('  User ID:', neo.user_id)
  
  // Find Neo's claims
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .eq('pet_id', neo.id)
    .order('created_at', { ascending: false })
    
  if (claimsError) {
    console.error('Error finding claims:', claimsError.message)
    return
  }
  
  console.log('\nClaims for Neo:', claims.length)
  
  if (claims.length > 0) {
    const latestClaim = claims[0]
    console.log('\nLatest claim:')
    console.log('  ID:', latestClaim.id)
    console.log('  Status:', latestClaim.status)
    console.log('  Visit date:', latestClaim.visit_date)
    console.log('  Created:', latestClaim.created_at)
    console.log('\n  🔗 Direct URL: http://localhost:5173/claim/' + latestClaim.id)
  } else {
    console.log('\n  No claims found for Neo')
  }
}

findNeoClaim()
