require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function findNationwidePets() {
  console.log('🔍 Finding pets with Nationwide insurance...\n')
  
  const { data: pets, error } = await supabase
    .from('pets')
    .select('id, name, policy_number, insurance_company')
    .ilike('insurance_company', '%nationwide%')
  
  if (error) {
    console.error('❌ Error:', error)
    return
  }
  
  if (!pets || pets.length === 0) {
    console.log('❌ No pets with Nationwide insurance found')
    
    // Show all pets and their insurance companies
    const { data: allPets } = await supabase
      .from('pets')
      .select('name, insurance_company, policy_number')
      .order('name')
    
    console.log('\n📋 All pets:')
    allPets.forEach(pet => {
      console.log(`   ${pet.name}: ${pet.insurance_company} (Policy: "${pet.policy_number || 'EMPTY'}")`)
    })
    return
  }
  
  console.log(`✅ Found ${pets.length} pet(s) with Nationwide:\n`)
  pets.forEach(pet => {
    console.log(`   Name: ${pet.name}`)
    console.log(`   Insurance: ${pet.insurance_company}`)
    console.log(`   Policy #: "${pet.policy_number}"`)
    console.log(`   Policy # Type: ${typeof pet.policy_number}`)
    console.log(`   Is Empty String: ${pet.policy_number === ''}`)
    console.log(`   Is Null: ${pet.policy_number === null}`)
    console.log()
  })
}

findNationwidePets()
