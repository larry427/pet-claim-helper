const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

const TEST_EMAIL = 'pch-test@petclaimhelper.com'
const TEST_PASSWORD = 'TestPassword123!'

async function setupTestAccount() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  console.log('🔧 Setting up automated test account...\n')

  // Step 1: Check if account exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', TEST_EMAIL)
    .single()

  let userId

  if (existingProfile) {
    console.log(`✅ Account already exists: ${TEST_EMAIL}`)
    console.log(`   User ID: ${existingProfile.id}`)
    userId = existingProfile.id
  } else {
    console.log(`❌ Account ${TEST_EMAIL} does not exist`)
    console.log('\n⚠️  MANUAL STEP REQUIRED:')
    console.log(`1. Go to http://localhost:5173`)
    console.log(`2. Click "Create Account"`)
    console.log(`3. Use email: ${TEST_EMAIL}`)
    console.log(`4. Use password: ${TEST_PASSWORD}`)
    console.log('5. Complete the email verification')
    console.log('6. Run this script again\n')

    // Save credentials to .env.test for future reference
    const envContent = `# Test account credentials - DO NOT COMMIT
TEST_EMAIL=${TEST_EMAIL}
TEST_PASSWORD=${TEST_PASSWORD}
`
    fs.writeFileSync('.env.test', envContent)
    console.log('📝 Credentials saved to .env.test (gitignored)\n')
    return
  }

  // Step 2: Update profile with test data
  console.log('\n📝 Updating profile data...')
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: 'Test User',
      address: '123 Test Street',
      city: 'Testville',
      state: 'CA',
      zip: '90210',
      phone: '555-123-4567'
    })
    .eq('id', userId)

  if (profileError) {
    console.error('❌ Error updating profile:', profileError.message)
    return
  }
  console.log('✅ Profile updated')

  // Step 3: Check for existing test pet
  const { data: existingPets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('name', 'TestPet')

  let petId

  if (existingPets && existingPets.length > 0) {
    console.log('\n✅ Test pet already exists: TestPet')
    petId = existingPets[0].id

    // Update pet data
    const { error: petError } = await supabase
      .from('pets')
      .update({
        species: 'cat',
        breed: 'Tabby',
        age: 5,
        weight: 10,
        insurer_name: 'pumpkin',
        policy_number: 'TEST-123456',
        updated_at: new Date().toISOString()
      })
      .eq('id', petId)

    if (petError) {
      console.error('❌ Error updating pet:', petError.message)
    } else {
      console.log('✅ Pet data updated')
    }
  } else {
    console.log('\n📝 Creating test pet...')
    const { data: newPet, error: petError } = await supabase
      .from('pets')
      .insert({
        user_id: userId,
        name: 'TestPet',
        species: 'cat',
        breed: 'Tabby',
        age: 5,
        weight: 10,
        insurer_name: 'pumpkin',
        policy_number: 'TEST-123456'
      })
      .select()
      .single()

    if (petError) {
      console.error('❌ Error creating pet:', petError.message)
      return
    }
    console.log('✅ Test pet created')
    petId = newPet.id
  }

  // Step 4: Create a test vet bill (if needed)
  console.log('\n📄 Checking for test vet bill...')
  const { data: existingBills } = await supabase
    .from('vet_bills')
    .select('*')
    .eq('pet_id', petId)
    .eq('description', 'Automated Test Bill')

  if (existingBills && existingBills.length > 0) {
    console.log('✅ Test vet bill already exists')
  } else {
    console.log('📝 Creating test vet bill...')
    const { error: billError } = await supabase
      .from('vet_bills')
      .insert({
        user_id: userId,
        pet_id: petId,
        description: 'Automated Test Bill',
        service_date: '2025-11-30',
        amount: 250.00,
        clinic_name: 'Test Veterinary Clinic',
        clinic_phone: '555-987-6543',
        diagnosis: 'Routine checkup with vaccinations',
        status: 'Not Submitted',
        pdf_url: 'https://example.com/test-bill.pdf' // Placeholder
      })

    if (billError) {
      console.error('❌ Error creating bill:', billError.message)
    } else {
      console.log('✅ Test vet bill created')
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ TEST ACCOUNT SETUP COMPLETE')
  console.log('='.repeat(60))
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Password: ${TEST_PASSWORD}`)
  console.log(`User ID: ${userId}`)
  console.log(`Pet ID: ${petId}`)
  console.log('\nTest Data:')
  console.log('  Name: Test User')
  console.log('  Address: 123 Test Street, Testville, CA 90210')
  console.log('  Phone: 555-123-4567')
  console.log('  Pet: TestPet (cat, Tabby, 5 years, 10 lbs)')
  console.log('  Insurance: Pumpkin')
  console.log('  Policy Number: TEST-123456')
  console.log('\n📝 Credentials saved in .env.test')
  console.log('='.repeat(60) + '\n')
}

setupTestAccount().catch(console.error)
