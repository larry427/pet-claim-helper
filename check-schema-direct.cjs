const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('PHASE 1 - STEP 1: CHECKING CURRENT DATABASE SCHEMA')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Check pets table columns by querying a sample record
  const { data: samplePet, error: petError } = await supabase
    .from('pets')
    .select('*')
    .limit(1)
    .single()

  if (petError) {
    console.error('❌ Error querying pets table:', petError)
  } else {
    console.log('📋 PETS TABLE - Current Columns:')
    const petColumns = Object.keys(samplePet).sort()
    petColumns.forEach(col => console.log(`   - ${col}`))
    console.log(`\n   Total: ${petColumns.length} columns`)
  }

  // Check profiles table columns by querying a sample record
  const { data: sampleProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
    .single()

  if (profileError) {
    console.error('\n❌ Error querying profiles table:', profileError)
  } else {
    console.log('\n📋 PROFILES TABLE - Current Columns:')
    const profileColumns = Object.keys(sampleProfile).sort()
    profileColumns.forEach(col => console.log(`   - ${col}`))
    console.log(`\n   Total: ${profileColumns.length} columns`)
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('CHECKING FOR REQUIRED COLUMNS')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Check if required columns exist
  const requiredPetColumns = ['had_other_insurance', 'other_insurance_provider', 'other_insurance_cancel_date']
  const requiredProfileColumns = ['signature']

  console.log('🔍 Required columns for PETS table:')
  requiredPetColumns.forEach(col => {
    const exists = samplePet && samplePet.hasOwnProperty(col)
    console.log(`   ${exists ? '✅' : '❌'} ${col}`)
  })

  console.log('\n🔍 Required columns for PROFILES table:')
  requiredProfileColumns.forEach(col => {
    const exists = sampleProfile && sampleProfile.hasOwnProperty(col)
    console.log(`   ${exists ? '✅' : '❌'} ${col}`)
  })

  console.log('\n')
}

checkSchema()
