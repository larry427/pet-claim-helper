import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSmokey() {
  console.log('Checking Smokey\'s pet record...\n')

  const { data, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, figo_policy_number, policy_number')
    .eq('user_id', 'b7486f8d-c69f-4069-acfd-a6cb22bdd664')
    .ilike('name', '%Smokey%')

  if (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('❌ No pets found matching "Smokey"')
    process.exit(1)
  }

  console.log('Found pet(s):\n')
  data.forEach(pet => {
    console.log(`ID: ${pet.id}`)
    console.log(`Name: ${pet.name}`)
    console.log(`Insurance Company: ${pet.insurance_company}`)
    console.log(`Figo Policy Number: ${pet.figo_policy_number || '(NULL/EMPTY)'}`)
    console.log(`Policy Number: ${pet.policy_number || '(NULL/EMPTY)'}`)
    console.log('')
  })
}

checkSmokey().catch(console.error)
