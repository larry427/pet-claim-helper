import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findUglyDogAdventures() {
  console.log('[Comprehensive Search] Looking for larry@uglydogadventures.com...\n')

  // 1. Check auth.users for emails containing "ugly"
  console.log('=== SEARCH 1: Auth users containing "ugly" ===')
  const { data: uglyUsers, error: uglyError } = await supabase.auth.admin.listUsers()

  if (!uglyError && uglyUsers) {
    const filtered = uglyUsers.users.filter(u =>
      u.email && u.email.toLowerCase().includes('ugly')
    )
    console.log(`Found ${filtered.length} users with "ugly" in email:`)
    filtered.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`))
  }
  console.log('\n')

  // 2. Check auth.users for emails containing "adventures"
  console.log('=== SEARCH 2: Auth users containing "adventures" ===')
  if (!uglyError && uglyUsers) {
    const filtered = uglyUsers.users.filter(u =>
      u.email && u.email.toLowerCase().includes('adventures')
    )
    console.log(`Found ${filtered.length} users with "adventures" in email:`)
    filtered.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`))
  }
  console.log('\n')

  // 3. Check profiles table for emails containing "ugly"
  console.log('=== SEARCH 3: Profiles containing "ugly" ===')
  const { data: uglyProfiles, error: uglyProfilesError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', '%ugly%')

  if (!uglyProfilesError && uglyProfiles) {
    console.log(`Found ${uglyProfiles.length} profiles with "ugly" in email:`)
    uglyProfiles.forEach(p => console.log(`  - ${p.email} (ID: ${p.id})`))
  }
  console.log('\n')

  // 4. Check profiles table for emails containing "adventures"
  console.log('=== SEARCH 4: Profiles containing "adventures" ===')
  const { data: advProfiles, error: advProfilesError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', '%adventures%')

  if (!advProfilesError && advProfiles) {
    console.log(`Found ${advProfiles.length} profiles with "adventures" in email:`)
    advProfiles.forEach(p => console.log(`  - ${p.email} (ID: ${p.id})`))
  }
  console.log('\n')

  // 5. Direct exact match in auth.users
  console.log('=== SEARCH 5: Exact match larry@uglydogadventures.com in auth ===')
  if (!uglyError && uglyUsers) {
    const exact = uglyUsers.users.find(u => u.email === 'larry@uglydogadventures.com')
    if (exact) {
      console.log('FOUND in auth.users!')
      console.log(JSON.stringify(exact, null, 2))
    } else {
      console.log('NOT FOUND in auth.users')
    }
  }
  console.log('\n')

  // 6. Direct exact match in profiles
  console.log('=== SEARCH 6: Exact match larry@uglydogadventures.com in profiles ===')
  const { data: exactProfile, error: exactError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'larry@uglydogadventures.com')
    .single()

  if (!exactError && exactProfile) {
    console.log('FOUND in profiles!')
    console.log(JSON.stringify(exactProfile, null, 2))

    // Get pet count
    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('id, name')
      .eq('user_id', exactProfile.id)

    if (!petsError && pets) {
      console.log(`\nPets: ${pets.length}`)
      pets.forEach(p => console.log(`  - ${p.name} (${p.id})`))
    }
  } else {
    console.log('NOT FOUND in profiles')
    console.log('Error:', exactError)
  }
  console.log('\n')

  // 7. List ALL emails (first 50) to scan manually
  console.log('=== SEARCH 7: ALL emails in auth.users (first 50) ===')
  if (!uglyError && uglyUsers) {
    const allEmails = uglyUsers.users.slice(0, 50).map(u => u.email).sort()
    allEmails.forEach(email => console.log(`  - ${email}`))
  }
  console.log('\n')

  // 8. Find users with 9 pets
  console.log('=== SEARCH 8: Users with 9 pets ===')
  const { data: allProfiles, error: allProfilesError } = await supabase
    .from('profiles')
    .select('id, email')

  if (!allProfilesError && allProfiles) {
    for (const profile of allProfiles) {
      const { data: pets, error: petsError } = await supabase
        .from('pets')
        .select('id')
        .eq('user_id', profile.id)

      if (!petsError && pets && pets.length === 9) {
        console.log(`FOUND USER WITH 9 PETS: ${profile.email} (ID: ${profile.id})`)

        // Get full details
        const { data: fullProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profile.id)
          .single()

        console.log('Profile:', JSON.stringify(fullProfile, null, 2))

        const { data: petDetails } = await supabase
          .from('pets')
          .select('*')
          .eq('user_id', profile.id)

        console.log('Pets:', JSON.stringify(petDetails, null, 2))
      }
    }
  }

  console.log('[Comprehensive Search] Done')
}

findUglyDogAdventures().catch(console.error)
