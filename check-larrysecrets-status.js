import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkStatus() {
  console.log('Checking larrysecrets@gmail.com status...\n')

  // Check auth user
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const user = authUsers.users.find(u => u.email === 'larrysecrets@gmail.com')

  if (user) {
    console.log('✅ Auth user exists:')
    console.log(`   ID: ${user.id}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Created: ${user.created_at}\n`)

    // Check profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      console.log('✅ Profile exists:')
      console.log(`   is_demo_account: ${profile.is_demo_account}\n`)
    } else {
      console.log('❌ No profile found\n')
    }

    // Check pets
    const { data: pets } = await supabase
      .from('pets')
      .select('id, name')
      .eq('user_id', user.id)

    console.log(`Pets: ${pets?.length || 0}`)
    if (pets && pets.length > 0) {
      pets.forEach(p => console.log(`  - ${p.name}`))
    }

    // Check claims
    const { data: claims } = await supabase
      .from('claims')
      .select('id')
      .eq('user_id', user.id)

    console.log(`\nClaims: ${claims?.length || 0}`)

  } else {
    console.log('❌ Auth user does NOT exist')
  }
}

checkStatus().catch(console.error)
