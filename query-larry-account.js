import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function queryLarryAccount() {
  console.log('[Query Larry Account] Fetching data for larry@uglydogadventures.com...\n')

  // 1. Query auth.users for Larry's account
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()

  if (authError) {
    console.error('[Auth Error]', authError)
    return
  }

  const larryAuthUser = authUsers.users.find(u => u.email === 'larry@uglydogadventures.com')

  if (!larryAuthUser) {
    console.log('[Error] Could not find user larry@uglydogadventures.com in auth.users')
    return
  }

  console.log('=== AUTH USER (auth.users) ===')
  console.log(JSON.stringify(larryAuthUser, null, 2))
  console.log('\n')

  const larryUserId = larryAuthUser.id

  // 2. Query profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', larryUserId)
    .single()

  if (profileError) {
    console.error('[Profile Error]', profileError)
  } else {
    console.log('=== PROFILE (profiles) ===')
    console.log(JSON.stringify(profile, null, 2))
    console.log('\n')
  }

  // 3. Query pets
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', larryUserId)

  if (petsError) {
    console.error('[Pets Error]', petsError)
  } else {
    console.log(`=== PETS (${pets?.length || 0} pets) ===`)
    console.log(JSON.stringify(pets, null, 2))
    console.log('\n')
  }

  // 4. Query claims (we won't copy these, but good to see)
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', larryUserId)

  if (claimsError) {
    console.error('[Claims Error]', claimsError)
  } else {
    console.log(`=== CLAIMS (${claims?.length || 0} claims) - WILL NOT BE COPIED ===`)
    console.log(JSON.stringify(claims, null, 2))
    console.log('\n')
  }

  // 5. Query medications
  const { data: medications, error: medicationsError } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', larryUserId)

  if (medicationsError) {
    console.error('[Medications Error]', medicationsError)
  } else {
    console.log(`=== MEDICATIONS (${medications?.length || 0} medications) - WILL NOT BE COPIED ===`)
    console.log(JSON.stringify(medications, null, 2))
    console.log('\n')
  }

  console.log('[Query Larry Account] Done')
}

queryLarryAccount().catch(console.error)
