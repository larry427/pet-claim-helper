const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findNationwideClaim() {
  // Find a claim for a pet with Nationwide insurance
  const { data: claims, error } = await supabase
    .from('claims')
    .select(`
      id,
      service_date,
      total_amount,
      diagnosis,
      body_part,
      pets (
        id,
        name,
        insurance_company,
        policy_number
      )
    `)
    .eq('pets.insurance_company', 'Nationwide')
    .limit(1)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  if (!claims || claims.length === 0) {
    console.log('\n❌ No Nationwide claims found in database')
    console.log('\n💡 We need to create a test Nationwide pet + claim for testing')
    return
  }
  
  console.log('\n✅ Found Nationwide claim:')
  console.log(JSON.stringify(claims[0], null, 2))
}

findNationwideClaim()
