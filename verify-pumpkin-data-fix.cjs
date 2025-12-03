// Verify Pumpkin PDF data fix in production
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verifyData() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 VERIFYING PUMPKIN PDF DATA FIX')
  console.log('='.repeat(80))

  try {
    // 1. Check Larry's profile for city/state/zip
    console.log('\n📋 Step 1: Checking Larry\'s profile data...')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, city, state, zip, address')
      .eq('email', 'larry@uglydogadventures.com')
      .single()

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError.message)
      return
    }

    console.log('✅ Profile found:')
    console.log(`   Email: ${profile.email}`)
    console.log(`   Name: ${profile.full_name}`)
    console.log(`   Address: ${profile.address || 'NOT SET'}`)
    console.log(`   City: ${profile.city || 'NOT SET ⚠️'}`)
    console.log(`   State: ${profile.state || 'NOT SET ⚠️'}`)
    console.log(`   Zip: ${profile.zip || 'NOT SET ⚠️'}`)

    const missingProfileFields = []
    if (!profile.city) missingProfileFields.push('city')
    if (!profile.state) missingProfileFields.push('state')
    if (!profile.zip) missingProfileFields.push('zip')

    if (missingProfileFields.length > 0) {
      console.log(`\n⚠️  WARNING: Profile missing: ${missingProfileFields.join(', ')}`)
      console.log('   These fields will be empty in PDFs until Larry updates his profile.')
    }

    // 2. Check Angel's pet data for breed and pumpkin_account_number
    console.log('\n🐾 Step 2: Checking Angel\'s pet data...')
    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('name, species, breed, pumpkin_account_number, policy_number')
      .eq('user_id', profile.id || (await supabase.from('profiles').select('id').eq('email', 'larry@uglydogadventures.com').single()).data?.id)

    if (petsError) {
      console.error('❌ Error fetching pets:', petsError.message)
      return
    }

    const angel = pets?.find(p => p.name === 'Angel')
    if (!angel) {
      console.log('❌ Angel not found in pets table')
      return
    }

    console.log('✅ Angel found:')
    console.log(`   Name: ${angel.name}`)
    console.log(`   Species: ${angel.species}`)
    console.log(`   Breed: ${angel.breed || 'NOT SET ⚠️'}`)
    console.log(`   Pumpkin Account #: ${angel.pumpkin_account_number || 'NOT SET ⚠️'}`)
    console.log(`   Policy #: ${angel.policy_number || 'NOT SET'}`)

    const missingPetFields = []
    if (!angel.breed) missingPetFields.push('breed')
    if (!angel.pumpkin_account_number) missingPetFields.push('pumpkin_account_number')

    if (missingPetFields.length > 0) {
      console.log(`\n⚠️  WARNING: Angel missing: ${missingPetFields.join(', ')}`)
      console.log('   These fields will be empty in PDFs until data is added to database.')
    }

    // 3. Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY')
    console.log('='.repeat(80))

    const totalMissing = missingProfileFields.length + missingPetFields.length
    if (totalMissing === 0) {
      console.log('✅ ALL DATA PRESENT! Pumpkin PDFs should now populate all fields correctly.')
    } else {
      console.log(`⚠️  ${totalMissing} field(s) missing from database:`)
      if (missingProfileFields.length > 0) {
        console.log(`   Profile: ${missingProfileFields.join(', ')}`)
      }
      if (missingPetFields.length > 0) {
        console.log(`   Pet: ${missingPetFields.join(', ')}`)
      }
      console.log('\n💡 Action needed:')
      if (missingProfileFields.length > 0) {
        console.log('   1. Larry needs to update his profile with city/state/zip')
      }
      if (missingPetFields.length > 0) {
        console.log('   2. Add breed and pumpkin_account_number to Angel\'s pet record')
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ CODE FIX DEPLOYED: server/index.js now pulls all 5 fields')
    console.log('📦 Render deployment: Will auto-deploy from main branch')
    console.log('🧪 Next: Test PDF generation after Render deploys')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)
  }
}

verifyData().catch(console.error)
