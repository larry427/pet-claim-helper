const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function listAllUsersAndPets() {
  console.log('='.repeat(80))
  console.log('DATABASE CLEANUP REVIEW - ALL USERS AND PETS')
  console.log('='.repeat(80))
  console.log()

  // Get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
    return
  }

  console.log('ALL USERS (PROFILES)')
  console.log('-'.repeat(120))
  console.log(
    'Email'.padEnd(35) +
    'Full Name'.padEnd(25) +
    'Created At'.padEnd(25) +
    'User ID'
  )
  console.log('-'.repeat(120))

  for (const profile of profiles) {
    const email = (profile.email || 'NO EMAIL').substring(0, 34)
    const fullName = (profile.full_name || 'NO NAME').substring(0, 24)
    const createdAt = new Date(profile.created_at).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).substring(0, 24)
    const userId = profile.id

    console.log(
      email.padEnd(35) +
      fullName.padEnd(25) +
      createdAt.padEnd(25) +
      userId
    )
  }

  console.log('-'.repeat(120))
  console.log(`Total Users: ${profiles.length}`)
  console.log()
  console.log()

  // Get all pets
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, user_id, name, species')
    .order('user_id', { ascending: true })

  if (petsError) {
    console.error('Error fetching pets:', petsError)
    return
  }

  console.log('ALL PETS')
  console.log('-'.repeat(120))
  console.log(
    'Pet Name'.padEnd(20) +
    'Species'.padEnd(15) +
    'Pet ID'.padEnd(45) +
    'Owner User ID'
  )
  console.log('-'.repeat(120))

  // Group pets by user
  const petsByUser = {}
  for (const pet of pets) {
    if (!petsByUser[pet.user_id]) {
      petsByUser[pet.user_id] = []
    }
    petsByUser[pet.user_id].push(pet)
  }

  // Print pets grouped by user
  for (const userId in petsByUser) {
    const userPets = petsByUser[userId]
    const userProfile = profiles.find(p => p.id === userId)
    const userName = userProfile ? (userProfile.full_name || userProfile.email || 'Unknown') : 'Unknown User'

    console.log()
    console.log(`>>> OWNER: ${userName} (${userId})`)
    console.log()

    for (const pet of userPets) {
      const petName = (pet.name || 'NO NAME').substring(0, 19)
      const species = (pet.species || 'UNKNOWN').substring(0, 14)
      const petId = pet.id

      console.log(
        '    ' + petName.padEnd(20) +
        species.padEnd(15) +
        petId.padEnd(45)
      )
    }
  }

  console.log()
  console.log('-'.repeat(120))
  console.log(`Total Pets: ${pets.length}`)
  console.log()
  console.log()

  // Summary by user
  console.log('SUMMARY BY USER')
  console.log('-'.repeat(80))
  console.log('Email/Name'.padEnd(40) + 'Pets'.padEnd(10) + 'User ID')
  console.log('-'.repeat(80))

  for (const profile of profiles) {
    const userPets = petsByUser[profile.id] || []
    const identifier = (profile.email || profile.full_name || 'NO EMAIL').substring(0, 39)
    const petCount = userPets.length.toString()
    const userId = profile.id

    console.log(
      identifier.padEnd(40) +
      petCount.padEnd(10) +
      userId
    )
  }

  console.log('-'.repeat(80))
  console.log()
  console.log('='.repeat(80))
  console.log('TEST ACCOUNTS TO CONSIDER DELETING:')
  console.log('='.repeat(80))
  console.log()
  console.log('Look for accounts with:')
  console.log('  - Test names (e.g., "test", "demo", "fredsmith")')
  console.log('  - Multiple pets with similar test names')
  console.log('  - Created recently for testing purposes')
  console.log('  - Email addresses that are clearly test accounts')
  console.log()
  console.log('KEEP these accounts:')
  console.log('  - Larry Levin (your account)')
  console.log('  - Any real beta users')
  console.log('  - Trinity (real user)')
  console.log('  - Alex (Al) (real user)')
  console.log()
}

listAllUsersAndPets().catch(console.error)
