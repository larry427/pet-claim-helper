const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Use Larry's actual account for testing since we can access it
const TEST_EMAIL = 'larry@uglydogadventures.com'
const TEST_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // Larry's user ID

async function setupTestPet() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  console.log('🔧 Setting up test pet for automated PDF testing...\n')
  console.log(`Using account: ${TEST_EMAIL}\n`)

  // Check for existing test pet
  const { data: existingPets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', TEST_USER_ID)
    .eq('name', 'PumpkinTestPet')

  let petId

  if (existingPets && existingPets.length > 0) {
    console.log('✅ Test pet already exists: PumpkinTestPet')
    petId = existingPets[0].id

    // Update pet data to ensure it's correct
    const { error: petError} = await supabase
      .from('pets')
      .update({
        species: 'cat',
        breed: 'Tabby',
        date_of_birth: '2020-01-01', // 5 years old
        insurance_company: 'pumpkin',
        pumpkin_account_number: 'TEST-PDF-123456',
        updated_at: new Date().toISOString()
      })
      .eq('id', petId)

    if (petError) {
      console.error('❌ Error updating pet:', petError.message)
    } else {
      console.log('✅ Pet data updated')
    }
  } else {
    console.log('📝 Creating test pet...')
    const { data: newPet, error: petError } = await supabase
      .from('pets')
      .insert({
        user_id: TEST_USER_ID,
        name: 'PumpkinTestPet',
        species: 'cat',
        breed: 'Tabby',
        date_of_birth: '2020-01-01', // 5 years old
        insurance_company: 'pumpkin',
        pumpkin_account_number: 'TEST-PDF-123456'
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

  // Create/update test vet bill
  console.log('\n📄 Setting up test vet bill...')
  const { data: existingBills } = await supabase
    .from('vet_bills')
    .select('*')
    .eq('pet_id', petId)
    .eq('description', 'PDF Test Bill')
    .limit(1)

  if (existingBills && existingBills.length > 0) {
    console.log('✅ Test vet bill already exists')
    console.log(`   Bill ID: ${existingBills[0].id}`)
  } else {
    console.log('📝 Creating test vet bill...')
    const { data: newBill, error: billError } = await supabase
      .from('vet_bills')
      .insert({
        user_id: TEST_USER_ID,
        pet_id: petId,
        description: 'PDF Test Bill',
        service_date: '2025-11-30',
        amount: 250.00,
        clinic_name: 'Test Veterinary Clinic',
        clinic_phone: '555-987-6543',
        diagnosis: 'Routine checkup with vaccinations',
        status: 'Not Submitted',
        pdf_url: 'https://example.com/test-bill.pdf' // Placeholder
      })
      .select()
      .single()

    if (billError) {
      console.error('❌ Error creating bill:', billError.message)
    } else {
      console.log('✅ Test vet bill created')
      console.log(`   Bill ID: ${newBill.id}`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ TEST PET SETUP COMPLETE')
  console.log('='.repeat(60))
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Password: (use your actual password)`)
  console.log(`User ID: ${TEST_USER_ID}`)
  console.log(`Pet ID: ${petId}`)
  console.log('\nTest Pet Data:')
  console.log('  Name: PumpkinTestPet')
  console.log('  Species: cat')
  console.log('  Breed: Tabby')
  console.log('  Age: 5 years (DOB: 2020-01-01)')
  console.log('  Insurance: Pumpkin')
  console.log('  Policy Number: TEST-PDF-123456')
  console.log('='.repeat(60) + '\n')

  // Save test credentials
  const fs = require('fs')
  const envContent = `# Test credentials - Use Larry's account for PDF testing
TEST_EMAIL=${TEST_EMAIL}
TEST_PASSWORD=<use your actual password>
TEST_USER_ID=${TEST_USER_ID}
TEST_PET_NAME=PumpkinTestPet
`
  fs.writeFileSync('.env.test', envContent)
  console.log('📝 Test info saved to .env.test\n')
}

setupTestPet().catch(console.error)
