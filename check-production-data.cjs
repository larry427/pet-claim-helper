const { createClient } = require('@supabase/supabase-js')

// Production Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Found' : 'MISSING')
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Found' : 'MISSING')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkProductionData() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 CHECKING PRODUCTION DATABASE - PUMPKIN FIELD VALUES')
  console.log('='.repeat(80))

  try {
    // 1. Find Larry's profile
    console.log('\n1️⃣ Finding Larry\'s profile...')
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, address, city, state, zip')
      .or('email.eq.larry@vrexistence.com,email.eq.larrylevin@me.com')

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError)
      return
    }

    if (!profiles || profiles.length === 0) {
      console.error('❌ No profile found for Larry')
      return
    }

    const larryProfile = profiles[0]
    console.log('\n✅ Larry\'s Profile:')
    console.log('  Email:', larryProfile.email)
    console.log('  Full Name:', larryProfile.full_name)
    console.log('  Address:', larryProfile.address || '(null)')
    console.log('  City:', larryProfile.city || '(null)')
    console.log('  State:', larryProfile.state || '(null)')
    console.log('  Zip:', larryProfile.zip || '(null)')

    // 2. Find Angel's pet record
    console.log('\n2️⃣ Finding Angel\'s pet record...')
    const { data: pets, error: petError } = await supabase
      .from('pets')
      .select('id, name, species, breed, insurance_company, policy_number, pumpkin_account_number')
      .eq('user_id', larryProfile.id)
      .eq('name', 'Angel')

    if (petError) {
      console.error('❌ Error fetching pet:', petError)
      return
    }

    if (!pets || pets.length === 0) {
      console.error('❌ No pet named Angel found for Larry')

      // List all pets for Larry
      console.log('\n📋 All pets for Larry:')
      const { data: allPets } = await supabase
        .from('pets')
        .select('name, species, insurance_company')
        .eq('user_id', larryProfile.id)

      if (allPets) {
        allPets.forEach(pet => {
          console.log(`  - ${pet.name} (${pet.species}) - ${pet.insurance_company}`)
        })
      }
      return
    }

    const angelPet = pets[0]
    console.log('\n✅ Angel\'s Pet Record:')
    console.log('  Name:', angelPet.name)
    console.log('  Species:', angelPet.species)
    console.log('  Breed:', angelPet.breed || '(null)')
    console.log('  Insurance Company:', angelPet.insurance_company)
    console.log('  Policy Number:', angelPet.policy_number || '(null)')
    console.log('  Pumpkin Account Number:', angelPet.pumpkin_account_number || '(null)')

    // 3. Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY - Fields needed for Pumpkin PDF:')
    console.log('='.repeat(80))

    const emptyFields = []

    if (!larryProfile.city) emptyFields.push('profile.city')
    if (!larryProfile.state) emptyFields.push('profile.state')
    if (!larryProfile.zip) emptyFields.push('profile.zip')
    if (!angelPet.breed) emptyFields.push('pets.breed')
    if (!angelPet.pumpkin_account_number) emptyFields.push('pets.pumpkin_account_number')

    if (emptyFields.length > 0) {
      console.log('\n❌ EMPTY FIELDS IN DATABASE:')
      emptyFields.forEach(field => {
        console.log(`  - ${field}`)
      })
      console.log('\n💡 ROOT CAUSE: The database is missing these values.')
      console.log('   The code is correct, but there\'s no data to display.')
      console.log('\n🔧 SOLUTION: Larry needs to:')
      if (!larryProfile.city || !larryProfile.state || !larryProfile.zip) {
        console.log('   1. Go to Settings and update his address with city, state, zip')
      }
      if (!angelPet.breed) {
        console.log('   2. Go to Pets and update Angel\'s breed')
      }
      if (!angelPet.pumpkin_account_number) {
        console.log('   3. Go to Pets and update Angel\'s Pumpkin account number')
      }
    } else {
      console.log('\n✅ All fields have data in the database!')
      console.log('   If the PDF is still showing empty fields, the problem is in the PDF generation code.')
    }

    console.log('\n' + '='.repeat(80))

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkProductionData()
