const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const TEST_EMAIL = 'pch-autotest@petclaimhelper.com'
const TEST_PASSWORD = 'AutoTest123!'
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001' // Fixed UUID for test user

async function createTestAccount() {
  // Use service role key for admin access
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // Admin access
  )

  console.log('🔧 Creating dedicated test account for automated testing...\n')

  // Step 1: Create or get auth user
  console.log('📝 Step 1: Getting/creating auth user...')

  // Try to get existing user first
  const { data: existingUser } = await supabase.auth.admin.listUsers()
  const foundUser = existingUser?.users?.find(u => u.email === TEST_EMAIL)

  let userId
  if (foundUser) {
    console.log('⚠️  Auth user already exists, using existing user')
    console.log(`   User ID: ${foundUser.id}`)
    userId = foundUser.id
  } else {
    // Create new user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: 'Auto Test User'
      }
    })

    if (authError) {
      console.error('❌ Error creating auth user:', authError.message)
      return
    }
    console.log('✅ Auth user created')
    console.log(`   User ID: ${authData.user.id}`)
    userId = authData.user.id
  }

  // Step 2: Create/update profile
  console.log('\n📝 Step 2: Creating profile...')
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: TEST_EMAIL,
      full_name: 'Auto Test User',
      address: '100 Test Street',
      city: 'Testville',
      state: 'CA',
      zip: '90210',
      phone: '+15555555555'
    }, { onConflict: 'id' })

  if (profileError) {
    console.error('❌ Error creating profile:', profileError.message)
    return
  }
  console.log('✅ Profile created')

  // Step 3: Create test pet (check if exists first)
  console.log('\n📝 Step 3: Creating test pet...')

  // Check if pet already exists
  const { data: existingPet } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('name', 'TestCat')
    .single()

  let pet
  if (existingPet) {
    console.log('⚠️  Test pet already exists, using existing pet')
    pet = existingPet
  } else {
    const { data: newPet, error: petError } = await supabase
      .from('pets')
      .insert({
        user_id: userId,
        name: 'TestCat',
        species: 'cat',
        breed: 'Tabby',
        date_of_birth: '2020-01-01',
        insurance_company: 'pumpkin',
        pumpkin_account_number: 'TEST-123456'
      })
      .select()
      .single()

    if (petError) {
      console.error('❌ Error creating pet:', petError.message)
      return
    }
    pet = newPet
    console.log('✅ Test pet created')
  }

  console.log(`   Pet ID: ${pet.id}`)

  // Step 4: Create test claim
  console.log('\n📝 Step 4: Creating test claim...')
  const { data: bill, error: billError } = await supabase
    .from('claims')
    .insert({
      user_id: userId,
      pet_id: pet.id,
      visit_title: 'Test Claim for Automated Testing',
      service_date: '2025-11-30',
      total_amount: 250.00,
      clinic_name: 'Test Veterinary Clinic',
      clinic_phone: '555-987-6543',
      diagnosis: 'Routine checkup for automated testing',
      filing_status: 'Not Submitted',
      pdf_path: null
    })
    .select()
    .single()

  if (billError) {
    console.error('❌ Error creating claim:', billError.message)
    return
  }
  console.log('✅ Test claim created')
  console.log(`   Claim ID: ${bill.id}`)

  // Step 5: Update credentials file
  console.log('\n📝 Step 5: Updating credentials file...')
  const fs = require('fs')
  const envContent = `# Test account credentials for automated PDF testing
# DO NOT COMMIT THIS FILE

TEST_EMAIL=${TEST_EMAIL}
TEST_PASSWORD=${TEST_PASSWORD}

# Test account data:
# - User: Auto Test User
# - Pet: TestCat (cat, Tabby)
# - Insurance: Pumpkin (account TEST-123456)
# - Profile address: Testville, CA 90210
`
  fs.writeFileSync('.env.test', envContent)
  console.log('✅ Credentials saved to .env.test')

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ DEDICATED TEST ACCOUNT CREATED')
  console.log('='.repeat(60))
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Password: ${TEST_PASSWORD}`)
  console.log(`User ID: ${userId}`)
  console.log(`\nProfile:`)
  console.log(`  Name: Auto Test User`)
  console.log(`  Address: 100 Test Street, Testville, CA 90210`)
  console.log(`  Phone: +15555555555`)
  console.log(`\nPet:`)
  console.log(`  Name: TestCat`)
  console.log(`  Species: cat`)
  console.log(`  Breed: Tabby`)
  console.log(`  DOB: 2020-01-01 (5 years old)`)
  console.log(`  Insurance: Pumpkin`)
  console.log(`  Account Number: TEST-123456`)
  console.log(`\nVet Bill:`)
  console.log(`  Amount: $250.00`)
  console.log(`  Date: 2025-11-30`)
  console.log(`  Status: Not Submitted`)
  console.log('\n⚠️  This is a DEDICATED TEST ACCOUNT - separate from live data')
  console.log('='.repeat(60) + '\n')
}

createTestAccount().catch(console.error)
