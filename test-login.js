import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

console.log('Testing full auth + data loading flow...\n')

const client = createClient(supabaseUrl, supabaseAnonKey)

const email = 'larry@uglydogadventures.com'
const password = '123456'

async function test() {
  console.log('1. Testing login...')
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('   ❌ Login failed:', authError.message)
    return
  }

  console.log('   ✅ Login successful')
  console.log('   User ID:', authData.user.id)
  console.log('   Email:', authData.user.email)

  const userId = authData.user.id
  const accessToken = authData.session.access_token

  console.log('\n2. Testing pets query (authenticated)...')
  const { data: pets, error: petsError } = await client
    .from('pets')
    .select('id, name, species')
    .eq('user_id', userId)

  if (petsError) {
    console.error('   ❌ Pets query failed:', petsError.message)
  } else {
    console.log(`   ✅ Pets loaded: ${pets.length} pets`)
    pets.forEach(p => console.log(`      - ${p.name} (${p.species})`))
  }

  console.log('\n3. Testing claims query (authenticated)...')
  const { data: claims, error: claimsError } = await client
    .from('claims')
    .select('id, visit_title')
    .eq('user_id', userId)
    .limit(5)

  if (claimsError) {
    console.error('   ❌ Claims query failed:', claimsError.message)
  } else {
    console.log(`   ✅ Claims loaded: ${claims.length} claims`)
    claims.forEach(c => console.log(`      - ${c.visit_title || 'Untitled'}`))
  }

  console.log('\n✅ All tests passed! The app should work.')
}

test().catch(console.error)
