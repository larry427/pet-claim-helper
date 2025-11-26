const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestData() {
  const userId = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // Larry's user ID
  
  console.log('\n📝 Creating Nationwide test pet + claim...')
  
  // 1. Create a test pet with Nationwide insurance
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .insert({
      user_id: userId,
      name: 'Max',
      species: 'Dog',
      breed: 'Golden Retriever',
      insurance_company: 'Nationwide',
      policy_number: 'NW-TEST-12345',
      date_of_birth: '2020-01-15'
    })
    .select()
    .single()
  
  if (petError) {
    console.error('❌ Error creating pet:', petError)
    return
  }
  
  console.log(`✅ Created pet: ${pet.name} (ID: ${pet.id})`)
  
  // 2. Create a test claim for this pet
  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .insert({
      user_id: userId,
      pet_id: pet.id,
      clinic_name: 'Happy Paws Veterinary Clinic',
      clinic_address: '123 Main St, Anytown, CA 90210',
      veterinarian_name: 'Dr. Smith',
      service_date: '2025-11-15',
      diagnosis: 'Ear infection',
      total_amount: 250.00,
      line_items: [
        { description: 'Examination', amount: 75.00 },
        { description: 'Medication', amount: 125.00 },
        { description: 'Lab work', amount: 50.00 }
      ],
      status: 'pending'
    })
    .select()
    .single()
  
  if (claimError) {
    console.error('❌ Error creating claim:', claimError)
    return
  }
  
  console.log(`✅ Created claim (ID: ${claim.id})`)
  console.log(`\n🎯 Test claim URL: http://localhost:5173 (refresh and look for Max's claim)`)
}

createTestData()
