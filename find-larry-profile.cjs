const { createClient } = require('@supabase/supabase-js')

// Production Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function findLarryProfile() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 SEARCHING FOR LARRY\'S PROFILE IN PRODUCTION')
  console.log('='.repeat(80))

  try {
    // Search for profiles with 'larry' or 'levin' in email or name
    console.log('\n1️⃣ Searching for profiles with "larry" or "levin"...')
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, address, city, state, zip, created_at')
      .or('email.ilike.%larry%,email.ilike.%levin%,full_name.ilike.%larry%,full_name.ilike.%levin%')
      .order('created_at', { ascending: false })
      .limit(10)

    if (profileError) {
      console.error('❌ Error:', profileError)
      return
    }

    if (!profiles || profiles.length === 0) {
      console.log('❌ No profiles found matching "larry" or "levin"')

      // Try to get ANY profiles to see what's in the database
      console.log('\n2️⃣ Fetching recent profiles...')
      const { data: anyProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

      if (anyProfiles && anyProfiles.length > 0) {
        console.log('\n📋 Recent profiles in database:')
        anyProfiles.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.email} - ${p.full_name || '(no name)'} - Created: ${p.created_at}`)
        })
      } else {
        console.log('❌ No profiles found in database at all!')
      }
      return
    }

    console.log(`\n✅ Found ${profiles.length} matching profile(s):\n`)

    profiles.forEach((profile, index) => {
      console.log(`Profile #${index + 1}:`)
      console.log('  Email:', profile.email)
      console.log('  Full Name:', profile.full_name || '(not set)')
      console.log('  Address:', profile.address || '(not set)')
      console.log('  City:', profile.city || '(not set)')
      console.log('  State:', profile.state || '(not set)')
      console.log('  Zip:', profile.zip || '(not set)')
      console.log('  Created:', profile.created_at)
      console.log('')
    })

    // Check pets for the first matching profile
    const larryProfile = profiles[0]
    console.log(`\n3️⃣ Checking pets for ${larryProfile.email}...\n`)

    const { data: pets, error: petError } = await supabase
      .from('pets')
      .select('id, name, species, breed, insurance_company, policy_number, pumpkin_account_number')
      .eq('user_id', larryProfile.id)

    if (petError) {
      console.error('❌ Error fetching pets:', petError)
      return
    }

    if (!pets || pets.length === 0) {
      console.log('❌ No pets found for this profile')
      return
    }

    console.log(`✅ Found ${pets.length} pet(s):\n`)
    pets.forEach((pet, index) => {
      console.log(`Pet #${index + 1}:`)
      console.log('  Name:', pet.name)
      console.log('  Species:', pet.species)
      console.log('  Breed:', pet.breed || '(not set)')
      console.log('  Insurance:', pet.insurance_company)
      console.log('  Policy Number:', pet.policy_number || '(not set)')
      console.log('  Pumpkin Account Number:', pet.pumpkin_account_number || '(not set)')
      console.log('')
    })

    // Summary of empty fields
    console.log('='.repeat(80))
    console.log('📊 PUMPKIN PDF FIELD STATUS')
    console.log('='.repeat(80))

    const emptyFields = []
    if (!larryProfile.city) emptyFields.push('❌ profile.city')
    else console.log('✅ profile.city:', larryProfile.city)

    if (!larryProfile.state) emptyFields.push('❌ profile.state')
    else console.log('✅ profile.state:', larryProfile.state)

    if (!larryProfile.zip) emptyFields.push('❌ profile.zip')
    else console.log('✅ profile.zip:', larryProfile.zip)

    // Check each pet
    pets.forEach((pet, i) => {
      console.log(`\nPet #${i + 1} (${pet.name}):`)
      if (!pet.breed) emptyFields.push(`❌ ${pet.name}.breed`)
      else console.log(`✅ breed: ${pet.breed}`)

      if (!pet.pumpkin_account_number) emptyFields.push(`❌ ${pet.name}.pumpkin_account_number`)
      else console.log(`✅ pumpkin_account_number: ${pet.pumpkin_account_number}`)
    })

    if (emptyFields.length > 0) {
      console.log('\n' + '='.repeat(80))
      console.log('❌ EMPTY FIELDS IN PRODUCTION DATABASE:')
      console.log('='.repeat(80))
      emptyFields.forEach(field => console.log(field))
      console.log('\n💡 This is why the Pumpkin PDF has empty fields.')
      console.log('   The code is working correctly, but the database has no data.')
    } else {
      console.log('\n✅ All required fields have data!')
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

findLarryProfile()
