require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function getHopeData() {
  console.log('\n🔍 GETTING HOPE\'S REAL DATA\n')
  console.log('═'.repeat(80))

  // Get Hope's pet record
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('*')
    .eq('name', 'Hope')
    .single()

  if (petError) {
    console.error('❌ Pet Error:', petError)
    process.exit(1)
  }

  console.log('\n✅ HOPE\'S PET RECORD:')
  console.log(JSON.stringify(pet, null, 2))

  // Get Larry's profile
  const { data: profile, error: profileError} = await supabase
    .from('profiles')
    .select('*')
    .eq('id', pet.user_id)
    .single()

  if (profileError) {
    console.error('❌ Profile Error:', profileError)
  } else {
    console.log('\n✅ LARRY\'S PROFILE:')
    console.log(JSON.stringify(profile, null, 2))
  }

  // Get one of Hope's claims/bills
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .eq('pet_id', pet.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (claimsError) {
    console.error('❌ Claims Error:', claimsError)
  } else if (claims && claims.length > 0) {
    console.log('\n✅ HOPE\'S MOST RECENT CLAIM:')
    console.log(JSON.stringify(claims[0], null, 2))
  } else {
    console.log('\n⚠️  No claims found for Hope')
  }

  console.log('\n' + '═'.repeat(80))
}

getHopeData().then(() => process.exit(0))
