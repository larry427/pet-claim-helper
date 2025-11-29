const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkInsuranceValues() {
  console.log('='.repeat(80))
  console.log('CHECKING INSURANCE_COMPANY VALUES IN DATABASE')
  console.log('='.repeat(80))
  console.log()

  // Get all distinct insurance_company values from pets table
  const { data: pets, error } = await supabase
    .from('pets')
    .select('insurance_company, name')
    .not('insurance_company', 'is', null)
    .order('insurance_company')

  if (error) {
    console.error('Error fetching pets:', error)
    return
  }

  // Group by insurance_company
  const insuranceGroups = {}
  for (const pet of pets) {
    const company = pet.insurance_company
    if (!insuranceGroups[company]) {
      insuranceGroups[company] = []
    }
    insuranceGroups[company].push(pet.name)
  }

  console.log('UNIQUE INSURANCE_COMPANY VALUES IN DATABASE:')
  console.log('-'.repeat(80))

  const sortedCompanies = Object.keys(insuranceGroups).sort()
  for (const company of sortedCompanies) {
    const petNames = insuranceGroups[company].join(', ')
    console.log(`"${company}" - Pets: ${petNames}`)
  }

  console.log()
  console.log('-'.repeat(80))
  console.log(`Total unique values: ${sortedCompanies.length}`)
  console.log()
}

checkInsuranceValues().catch(console.error)
