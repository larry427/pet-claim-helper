require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkColumn() {
  console.log('='.repeat(80))
  console.log('CHECKING healthy_paws_pet_id COLUMN IN pets TABLE')
  console.log('='.repeat(80))
  console.log('')

  const { data, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, healthy_paws_pet_id')
    .limit(5)

  if (error) {
    console.error('ERROR querying pets table:', error.message)
    console.error('This likely means the column does not exist')
    return
  }

  console.log('Column exists! Sample data:')
  console.log('')
  data.forEach(pet => {
    console.log('Pet:', pet.name)
    console.log('  Insurance:', pet.insurance_company)
    console.log('  HP Pet ID:', pet.healthy_paws_pet_id || 'NULL')
    console.log('')
  })
}

checkColumn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
