require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkDates() {
  console.log('\n🔍 Checking Hope date fields...\n')

  const { data, error } = await supabase
    .from('pets')
    .select('name, date_of_birth, adoption_date, spay_neuter_status, spay_neuter_date')
    .eq('name', 'Hope')
    .single()

  if (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  console.log('Hope Database Values:')
  console.log('=====================')
  console.log('name:', data.name)
  console.log('date_of_birth:', data.date_of_birth, '(type:', typeof data.date_of_birth + ')')
  console.log('  - is null?', data.date_of_birth === null)
  console.log('  - is empty string?', data.date_of_birth === '')
  console.log('')
  console.log('adoption_date:', data.adoption_date, '(type:', typeof data.adoption_date + ')')
  console.log('  - is null?', data.adoption_date === null)
  console.log('  - is empty string?', data.adoption_date === '')
  console.log('')
  console.log('spay_neuter_status:', data.spay_neuter_status)
  console.log('spay_neuter_date:', data.spay_neuter_date, '(type:', typeof data.spay_neuter_date + ')')
  console.log('  - is null?', data.spay_neuter_date === null)
  console.log('  - is empty string?', data.spay_neuter_date === '')
  console.log('=====================\n')

  process.exit(0)
}

checkDates()
