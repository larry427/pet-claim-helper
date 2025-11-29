const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function createDropdownTestUser() {
  console.log('='.repeat(80))
  console.log('CREATING DROPDOWN TEST USER')
  console.log('='.repeat(80))
  console.log()

  const email = 'testuser-dropdown@test.com'
  const password = 'TestDropdown123!'
  const name = 'Dropdown Tester'

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (existingUser) {
    console.log('⚠️  User already exists!')
    console.log('User ID:', existingUser.id)
    console.log('Email:', existingUser.email)
    console.log('Email Confirmed:', existingUser.email_confirmed_at ? 'Yes' : 'No')
    console.log()
    console.log('Deleting existing user and recreating...')

    // Delete existing user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id)
    if (deleteError) {
      console.error('Error deleting existing user:', deleteError)
      return
    }
    console.log('✅ Existing user deleted')
    console.log()
  }

  // Create new user with email already confirmed
  console.log('Creating new user...')
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: name
    }
  })

  if (createError) {
    console.error('❌ Error creating user:', createError)
    return
  }

  console.log('✅ User created successfully!')
  console.log()
  console.log('='.repeat(80))
  console.log('TEST ACCOUNT CREDENTIALS')
  console.log('='.repeat(80))
  console.log('Email:', email)
  console.log('Password:', password)
  console.log('Name:', name)
  console.log('User ID:', newUser.user.id)
  console.log('Email Confirmed:', newUser.user.email_confirmed_at ? 'Yes ✅' : 'No')
  console.log()
  console.log('='.repeat(80))
  console.log('READY FOR TESTING')
  console.log('='.repeat(80))
  console.log('✅ No pets created - user will go through full onboarding flow')
  console.log('✅ Login at http://localhost:5173 with the credentials above')
  console.log()
}

createDropdownTestUser().catch(console.error)
