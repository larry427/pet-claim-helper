/**
 * Check Neo's insurance company in the database
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkNeoInsurance() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 CHECKING NEO\'S INSURANCE COMPANY')
  console.log('='.repeat(80) + '\n')

  // Find Neo
  const { data: pets, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, policy_number, user_id')
    .ilike('name', '%neo%')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Found ${pets.length} pet(s) named Neo:\n`)

  pets.forEach(pet => {
    console.log(`Pet: ${pet.name}`)
    console.log(`  ID: ${pet.id}`)
    console.log(`  Insurance Company: "${pet.insurance_company}"`)
    console.log(`  Policy Number: "${pet.policy_number}"`)
    console.log(`  User ID: ${pet.user_id}`)
    console.log()
  })

  // Also check claims for Neo
  if (pets.length > 0) {
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('id, diagnosis, service_date, pet_id, pets(name, insurance_company)')
      .eq('pet_id', pets[0].id)
      .limit(3)

    if (!claimsError && claims) {
      console.log(`\nRecent claims for ${pets[0].name}:`)
      claims.forEach(claim => {
        console.log(`  - ${claim.diagnosis} (${claim.service_date})`)
        console.log(`    Pet insurance: ${claim.pets?.insurance_company}`)
      })
    }
  }

  console.log('\n' + '='.repeat(80) + '\n')
}

checkNeoInsurance()
