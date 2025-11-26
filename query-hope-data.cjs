const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function queryHopeData() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('PHASE 2 - QUERYING HOPE\'S CURRENT DATA')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Query Hope's pet record
  const { data: hope, error } = await supabase
    .from('pets')
    .select('id, name, date_of_birth, insurance_company, had_other_insurance, other_insurance_provider, other_insurance_cancel_date, adoption_date, spay_neuter_status, spay_neuter_date')
    .eq('name', 'Hope')
    .single()

  if (error) {
    console.error('❌ Error querying Hope:', error)
    return
  }

  if (!hope) {
    console.log('❌ Hope not found in database')
    return
  }

  console.log('📋 HOPE\'S CURRENT DATA:')
  console.log('   ID:', hope.id)
  console.log('   Name:', hope.name)
  console.log('   Insurance Company:', hope.insurance_company)
  console.log('')
  console.log('🎂 Date of Birth:', hope.date_of_birth || '❌ NULL (MISSING!)')
  console.log('📅 Adoption Date:', hope.adoption_date || '(not set)')
  console.log('🏥 Had Other Insurance:', hope.had_other_insurance !== null ? hope.had_other_insurance : '(not set)')
  console.log('   └─ Other Insurance Provider:', hope.other_insurance_provider || '(not set)')
  console.log('   └─ Other Insurance Cancel Date:', hope.other_insurance_cancel_date || '(not set)')
  console.log('💉 Spay/Neuter Status:', hope.spay_neuter_status || '(not set)')
  console.log('   └─ Spay/Neuter Date:', hope.spay_neuter_date || '(not set)')

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('ANALYSIS')
  console.log('═══════════════════════════════════════════════════════════\n')

  const missing = []
  if (!hope.date_of_birth) missing.push('date_of_birth')
  if (hope.had_other_insurance === null) missing.push('had_other_insurance')

  if (missing.length > 0) {
    console.log('❌ MISSING FIELDS:', missing.join(', '))
    console.log('\n   These fields are required by Trupanion and will be asked')
    console.log('   in the MissingFieldsModal when user clicks Auto-Submit.')
  } else {
    console.log('✅ All required Trupanion fields are present!')
  }

  console.log('\n')
}

queryHopeData()
