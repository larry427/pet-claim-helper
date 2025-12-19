import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findLarryAccounts() {
  console.log('[Find Larry Accounts] Searching for all Larry-related accounts...\n')

  // Query all users and find ones with "larry" in email
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()

  if (authError) {
    console.error('[Auth Error]', authError)
    return
  }

  const larryUsers = authUsers.users.filter(u =>
    u.email && u.email.toLowerCase().includes('larry')
  )

  console.log(`Found ${larryUsers.length} accounts with "larry" in email:\n`)

  for (const user of larryUsers) {
    console.log('=' .repeat(80))
    console.log(`Email: ${user.email}`)
    console.log(`ID: ${user.id}`)
    console.log(`Created: ${user.created_at}`)
    console.log(`Confirmed: ${user.email_confirmed_at || 'Not confirmed'}`)

    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profileError && profile) {
      console.log(`Profile exists:`, profile)
    }

    // Get pets count
    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('id, name')
      .eq('user_id', user.id)

    if (!petsError && pets) {
      console.log(`Pets (${pets.length}):`, pets.map(p => p.name).join(', '))
    }

    // Get claims count
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('id')
      .eq('user_id', user.id)

    if (!claimsError && claims) {
      console.log(`Claims: ${claims.length}`)
    }

    console.log('\n')
  }

  console.log('[Find Larry Accounts] Done')
}

findLarryAccounts().catch(console.error)
