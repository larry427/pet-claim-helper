require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkInsurance() {
  console.log('\n🔍 STEP 1: Checking Hope and Bo insurance_company values...\n')

  const { data: pets, error } = await supabase
    .from('pets')
    .select('name, insurance_company')
    .in('name', ['Hope', 'Bo'])

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!pets || pets.length === 0) {
    console.log('❌ No pets found named Hope or Bo')
    return
  }

  console.log('📊 Results:')
  console.log('='.repeat(60))
  pets.forEach(pet => {
    console.log(`Pet: ${pet.name}`)
    console.log(`Insurance Company: "${pet.insurance_company}"`)
    console.log(`Type: ${typeof pet.insurance_company}`)
    console.log(`Is null: ${pet.insurance_company === null}`)
    console.log(`Is empty string: ${pet.insurance_company === ''}`)
    console.log('='.repeat(60))
  })

  process.exit(0)
}

checkInsurance()
