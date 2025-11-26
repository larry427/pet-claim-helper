// Debug insurance company badge issue
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugInsuranceBadge() {
  console.log('\n=== DEBUGGING INSURANCE COMPANY BADGE ===\n')

  // 1. Check database schema - what columns exist in pets table?
  console.log('1. Checking pets table schema...')
  const { data: samplePet, error: petError } = await supabase
    .from('pets')
    .select('*')
    .limit(1)

  if (petError) {
    console.error('Error fetching pet:', petError)
  } else {
    console.log('Sample pet columns:', Object.keys(samplePet[0] || {}))
    console.log('Sample pet data:', samplePet[0])
  }

  // 2. Check what claims table returns when joined with pets
  console.log('\n2. Checking claims query (what listClaims returns)...')

  // Get a user with claims
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*, pets(id, name, species, insurance_company)')
    .limit(3)

  if (claimsError) {
    console.error('Error fetching claims:', claimsError)
  } else {
    console.log(`Found ${claims?.length} claims`)
    claims?.forEach((claim, i) => {
      console.log(`\nClaim ${i + 1}:`)
      console.log('  ID:', claim.id)
      console.log('  Pet data:', claim.pets)
      console.log('  Pet columns:', claim.pets ? Object.keys(claim.pets) : 'NO PETS DATA')
      console.log('  Has insurance_company?', claim.pets?.insurance_company !== undefined)
      console.log('  Insurance company value:', claim.pets?.insurance_company)
    })
  }

  // 3. Check pets with actual insurance companies set
  console.log('\n3. Finding pets with insurance companies...')
  const { data: petsWithInsurance } = await supabase
    .from('pets')
    .select('id, name, insurance_company, insuranceCompany')
    .not('insurance_company', 'is', null)
    .limit(5)

  console.log('Pets with insurance_company set:', petsWithInsurance?.length || 0)
  petsWithInsurance?.forEach(pet => {
    console.log(`  - ${pet.name}: insurance_company="${pet.insurance_company}", insuranceCompany="${pet.insuranceCompany}"`)
  })

  // 4. Check if there's a column name mismatch
  console.log('\n4. Checking for column name variations...')
  const { data: allPets } = await supabase
    .from('pets')
    .select('*')
    .limit(1)

  if (allPets?.[0]) {
    const columns = Object.keys(allPets[0])
    console.log('All pet columns:', columns)
    const insuranceColumns = columns.filter(c => c.toLowerCase().includes('insurance'))
    console.log('Insurance-related columns:', insuranceColumns)
  }

  // 5. Check a specific user's data (Larry's)
  console.log('\n5. Checking Larry\'s data specifically...')

  // Find Larry's user ID
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', '%larry%')
    .limit(1)

  if (profiles?.[0]) {
    const userId = profiles[0].id
    console.log('Larry\'s user ID:', userId)
    console.log('Larry\'s email:', profiles[0].email)

    // Get Larry's claims with pet data
    const { data: larryClaims } = await supabase
      .from('claims')
      .select('*, pets(*)')
      .eq('user_id', userId)
      .limit(3)

    console.log(`\nLarry's claims (${larryClaims?.length || 0}):`)
    larryClaims?.forEach((claim, i) => {
      console.log(`\nClaim ${i + 1}:`)
      console.log('  Visit:', claim.visit_title || claim.diagnosis)
      console.log('  Pet name:', claim.pets?.name)
      console.log('  Pet insurance_company:', claim.pets?.insurance_company)
      console.log('  Pet insuranceCompany:', claim.pets?.insuranceCompany)
      console.log('  All pet keys:', claim.pets ? Object.keys(claim.pets) : 'NO PETS')
    })
  }

  console.log('\n=== DEBUG COMPLETE ===\n')
}

debugInsuranceBadge()
