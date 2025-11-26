require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkDatabase() {
  console.log('🔍 CHECKING DATABASE FOR CLINIC PHONE VALUES')
  console.log('='.repeat(80))

  const { data, error } = await supabase
    .from('claims')
    .select('id, clinic_name, clinic_phone, created_at')
    .eq('user_id', 'c4419d0e-a234-4b93-bdbd-23e07090e57d')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Database error:', error)
    return
  }

  console.log(`Found ${data.length} claims for user c4419d0e-a234-4b93-bdbd-23e07090e57d:`)
  console.log('')

  data.forEach((claim, idx) => {
    console.log(`${idx + 1}. Claim ID: ${claim.id}`)
    console.log(`   Clinic Name: ${claim.clinic_name || '(NULL)'}`)
    console.log(`   Clinic Phone: ${claim.clinic_phone || '❌ NULL/EMPTY'}`)
    console.log(`   Created: ${claim.created_at}`)
    console.log('')
  })

  const nullCount = data.filter(c => !c.clinic_phone).length
  const hasValueCount = data.filter(c => c.clinic_phone).length

  console.log('='.repeat(80))
  console.log(`📊 SUMMARY:`)
  console.log(`   Claims with phone: ${hasValueCount}`)
  console.log(`   Claims WITHOUT phone (NULL): ${nullCount}`)
  console.log('='.repeat(80))

  if (nullCount === data.length) {
    console.log('')
    console.log('⚠️  ALL CLAIMS HAVE NULL clinic_phone - THE PROBLEM IS IN THE SAVE LOGIC')
  } else if (hasValueCount > 0) {
    console.log('')
    console.log('✅ Some claims have phone values - check if PDF generator is reading them')
  }
}

checkDatabase().then(() => process.exit(0))
