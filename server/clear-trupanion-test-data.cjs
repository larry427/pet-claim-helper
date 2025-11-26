/**
 * Clear Trupanion fields from Neo's record to test MissingFieldsModal
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function clearTrupanionFields() {
  console.log('\n' + '='.repeat(80))
  console.log('🧹 CLEARING TRUPANION TEST DATA FROM NEO')
  console.log('='.repeat(80) + '\n')

  try {
    // Find Neo (Trupanion pet)
    const { data: pets, error: fetchError } = await supabase
      .from('pets')
      .select('*')
      .eq('name', 'Neo')
      .eq('insurance_company', 'Trupanion')

    if (fetchError) {
      console.error('❌ Error fetching Neo:', fetchError.message)
      process.exit(1)
    }

    if (!pets || pets.length === 0) {
      console.log('⚠️  Neo not found')
      process.exit(1)
    }

    const neo = pets[0]
    console.log(`✅ Found Neo: ${neo.id}`)
    console.log(`   Current data:`)
    console.log(`   - had_other_insurance: ${neo.had_other_insurance}`)
    console.log(`   - other_insurance_provider: ${neo.other_insurance_provider}`)
    console.log(`   - other_insurance_cancel_date: ${neo.other_insurance_cancel_date}`)
    console.log(`   - other_hospitals_visited: ${neo.other_hospitals_visited}`)

    // Clear Trupanion fields
    const { error: updateError } = await supabase
      .from('pets')
      .update({
        had_other_insurance: null,
        other_insurance_provider: null,
        other_insurance_cancel_date: null,
        other_hospitals_visited: null
      })
      .eq('id', neo.id)

    if (updateError) {
      console.error('\n❌ Error clearing fields:', updateError.message)
      process.exit(1)
    }

    console.log('\n✅ Successfully cleared Trupanion fields from Neo!')
    console.log('   Now when you click Auto-Submit, MissingFieldsModal should appear.\n')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ Script failed:', error.message)
    process.exit(1)
  }
}

clearTrupanionFields()
