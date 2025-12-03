const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function checkTestAccounts() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  console.log('🔍 Checking for existing test accounts...\n')

  // Check profiles for test-related emails
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, city, state, zip')
    .or('email.ilike.%test%,email.ilike.%automation%')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  if (profiles.length === 0) {
    console.log('❌ No test accounts found')
    console.log('\nRecommendation: Create a new test account')
    return
  }

  console.log(`✅ Found ${profiles.length} test account(s):\n`)

  for (const profile of profiles) {
    console.log(`📧 ${profile.email}`)
    console.log(`   User ID: ${profile.id}`)
    console.log(`   Name: ${profile.full_name || 'Not set'}`)
    console.log(`   Address: ${profile.city || '?'}, ${profile.state || '?'} ${profile.zip || '?'}`)

    // Check pets for this user
    const { data: pets } = await supabase
      .from('pets')
      .select('name, species, breed, insurer_name')
      .eq('user_id', profile.id)

    if (pets && pets.length > 0) {
      console.log(`   Pets (${pets.length}):`)
      pets.forEach(pet => {
        console.log(`     - ${pet.name} (${pet.species}) - ${pet.breed || 'No breed'} - Insurer: ${pet.insurer_name || 'None'}`)
      })
    } else {
      console.log('   Pets: None')
    }
    console.log('')
  }
}

checkTestAccounts().catch(console.error)
