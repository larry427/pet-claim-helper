require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkClinicPhoneColumn() {
  console.log('Checking if clinic_phone column exists in claims table...')
  console.log('Testing against production database:', process.env.VITE_SUPABASE_URL)
  console.log('')

  try {
    // Try to select clinic_phone column
    const { data, error } = await supabase
      .from('claims')
      .select('clinic_phone')
      .limit(1)

    if (error) {
      console.error('❌ clinic_phone column does NOT exist!')
      console.error('Error:', error.message)
      console.error('Code:', error.code)
      console.log('\n📝 Solution: Run server/migrations/add-clinic-phone.sql on production')
      console.log('   This is likely the cause of the 409 Conflict Error')
      return false
    }

    console.log('✅ clinic_phone column EXISTS in production database')
    console.log('Sample data:', data)
    console.log('\n🔍 The 409 error must be caused by something else')
    console.log('   Will need to investigate further...')
    return true
  } catch (err) {
    console.error('Unexpected error checking column:', err)
    return false
  }
}

checkClinicPhoneColumn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
