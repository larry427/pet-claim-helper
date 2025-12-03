const { createClient } = require('@supabase/supabase-js')

// Production Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkCorrectProfile() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 CHECKING larry@uglydogadventures.com PROFILE DATA')
  console.log('='.repeat(80))

  try {
    // 1. Get Larry's correct profile
    console.log('\n1️⃣ Fetching profile for larry@uglydogadventures.com...\n')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, address, city, state, zip')
      .eq('email', 'larry@uglydogadventures.com')
      .single()

    if (profileError || !profile) {
      console.error('❌ Error fetching profile:', profileError)
      return
    }

    console.log('✅ Profile Found:')
    console.log('  Email:', profile.email)
    console.log('  Full Name:', profile.full_name || '(null)')
    console.log('  Address:', profile.address || '(null)')
    console.log('  City:', profile.city || '(null)')
    console.log('  State:', profile.state || '(null)')
    console.log('  Zip:', profile.zip || '(null)')
    console.log('  User ID:', profile.id)

    // 2. Get Angel's pet record
    console.log('\n2️⃣ Fetching Angel pet record for this user...\n')

    const { data: pets, error: petError } = await supabase
      .from('pets')
      .select('id, name, species, breed, insurance_company, policy_number, pumpkin_account_number')
      .eq('user_id', profile.id)
      .eq('name', 'Angel')

    if (petError) {
      console.error('❌ Error fetching pet:', petError)
      return
    }

    if (!pets || pets.length === 0) {
      console.log('❌ No pet named "Angel" found for this user')

      // List all pets for this user
      console.log('\n📋 All pets for this user:')
      const { data: allPets } = await supabase
        .from('pets')
        .select('name, species, breed, insurance_company, pumpkin_account_number')
        .eq('user_id', profile.id)

      if (allPets && allPets.length > 0) {
        allPets.forEach((pet, i) => {
          console.log(`\n  Pet #${i + 1}:`)
          console.log(`    Name: ${pet.name}`)
          console.log(`    Species: ${pet.species}`)
          console.log(`    Breed: ${pet.breed || '(null)'}`)
          console.log(`    Insurance: ${pet.insurance_company}`)
          console.log(`    Pumpkin Account #: ${pet.pumpkin_account_number || '(null)'}`)
        })
      } else {
        console.log('  No pets found')
      }
      return
    }

    const angel = pets[0]
    console.log('✅ Angel Pet Record:')
    console.log('  Name:', angel.name)
    console.log('  Species:', angel.species)
    console.log('  Breed:', angel.breed || '(null)')
    console.log('  Insurance Company:', angel.insurance_company)
    console.log('  Policy Number:', angel.policy_number || '(null)')
    console.log('  Pumpkin Account Number:', angel.pumpkin_account_number || '(null)')

    // 3. Check for empty fields
    console.log('\n' + '='.repeat(80))
    console.log('📊 PUMPKIN PDF FIELD STATUS FOR larry@uglydogadventures.com')
    console.log('='.repeat(80) + '\n')

    const results = {
      profile_city: profile.city,
      profile_state: profile.state,
      profile_zip: profile.zip,
      angel_breed: angel.breed,
      angel_pumpkin_account_number: angel.pumpkin_account_number
    }

    const emptyFields = []
    const populatedFields = []

    Object.entries(results).forEach(([field, value]) => {
      if (!value || value === '') {
        emptyFields.push(field)
        console.log(`❌ ${field}: (null/empty)`)
      } else {
        populatedFields.push(field)
        console.log(`✅ ${field}: "${value}"`)
      }
    })

    console.log('\n' + '='.repeat(80))

    if (emptyFields.length > 0) {
      console.log('❌ ROOT CAUSE CONFIRMED:')
      console.log('='.repeat(80))
      console.log(`\n${emptyFields.length} field(s) are NULL/empty in the production database:\n`)
      emptyFields.forEach(field => console.log(`  - ${field}`))

      console.log('\n💡 The code is working correctly.')
      console.log('   The PDF generation code reads from these database fields.')
      console.log('   When the fields are NULL, they appear empty in the PDF.')

      console.log('\n🔧 SOLUTION:')
      console.log('   Larry needs to update his profile in production:')
      if (emptyFields.includes('profile_city') || emptyFields.includes('profile_state') || emptyFields.includes('profile_zip')) {
        console.log('   1. Go to Settings → Update city, state, zip')
      }
      if (emptyFields.includes('angel_breed') || emptyFields.includes('angel_pumpkin_account_number')) {
        console.log('   2. Go to Pets → Edit Angel → Update breed and Pumpkin account number')
      }
    } else {
      console.log('✅ ALL FIELDS POPULATED!')
      console.log('='.repeat(80))
      console.log('\nAll 5 required fields have data in the production database.')
      console.log('If the PDF is still showing empty fields, the problem is in')
      console.log('the PDF generation code, not the database.')
    }

    console.log('\n' + '='.repeat(80))

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkCorrectProfile()
