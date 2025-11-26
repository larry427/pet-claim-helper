import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const token = 'fdc7c78e-bc86-42d3-be36-007f9effa9ef'

console.log('🔍 TESTING ANON (PUBLIC) ACCESS TO MAGIC LINK DATA')
console.log('='.repeat(80))
console.log('Token:', token)
console.log()

// Test 1: Service Role (admin) - should work
console.log('TEST 1: SERVICE ROLE (ADMIN) ACCESS')
console.log('-'.repeat(80))
const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data: adminData, error: adminError } = await adminClient
  .from('medication_doses')
  .select(`
    *,
    medications (
      *,
      pets (
        name,
        species
      )
    )
  `)
  .eq('one_time_token', token)
  .single()

if (adminError) {
  console.log('❌ Admin query failed:', adminError.message)
} else {
  console.log('✅ Admin can access:')
  console.log('  Dose ID:', adminData?.id)
  console.log('  Medication:', adminData?.medications?.medication_name)
  console.log('  Pet:', adminData?.medications?.pets?.name)
  console.log('  Full medications object:', adminData?.medications ? 'Present' : '❌ NULL')
}

// Test 2: Anon Key (public) - this is what frontend uses
console.log('\nTEST 2: ANON KEY (PUBLIC/UNAUTHENTICATED) ACCESS')
console.log('-'.repeat(80))
const publicClient = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const { data: publicData, error: publicError } = await publicClient
  .from('medication_doses')
  .select(`
    *,
    medications (
      *,
      pets (
        name,
        species
      )
    )
  `)
  .eq('one_time_token', token)
  .single()

if (publicError) {
  console.log('❌ PUBLIC ACCESS FAILED!')
  console.log('  Error:', publicError.message)
  console.log('  Code:', publicError.code)
  console.log('  Details:', publicError.details)
} else {
  console.log('✅ Public can access dose:')
  console.log('  Dose ID:', publicData?.id)
  console.log('  Medication object:', publicData?.medications ? 'Present' : '❌ NULL')
  console.log('  Medication name:', publicData?.medications?.medication_name || '❌ MISSING')
  console.log('  Pet object:', publicData?.medications?.pets ? 'Present' : '❌ NULL')
  console.log('  Pet name:', publicData?.medications?.pets?.name || '❌ MISSING')

  if (!publicData?.medications) {
    console.log('\n🚨 ROOT CAUSE: medications JOIN returns NULL')
    console.log('   This means RLS is blocking public access to medications table')
  }

  if (publicData?.medications && !publicData?.medications?.pets) {
    console.log('\n🚨 ROOT CAUSE: pets JOIN returns NULL')
    console.log('   This means RLS is blocking public access to pets table')
  }
}

// Test 3: Direct query to medications table
console.log('\nTEST 3: DIRECT PUBLIC ACCESS TO MEDICATIONS TABLE')
console.log('-'.repeat(80))

if (adminData?.medication_id) {
  const { data: medData, error: medError } = await publicClient
    .from('medications')
    .select('*')
    .eq('id', adminData.medication_id)
    .single()

  if (medError) {
    console.log('❌ Public CANNOT read medications table directly')
    console.log('  Error:', medError.message)
    console.log('  Code:', medError.code)
    console.log('\n🚨 THIS IS THE PROBLEM!')
    console.log('   RLS policy on medications table is blocking public access')
  } else {
    console.log('✅ Public CAN read medications table')
    console.log('  Medication name:', medData?.medication_name)
  }
}

// Test 4: Direct query to pets table
console.log('\nTEST 4: DIRECT PUBLIC ACCESS TO PETS TABLE')
console.log('-'.repeat(80))

if (adminData?.medications?.pet_id) {
  const { data: petData, error: petError } = await publicClient
    .from('pets')
    .select('*')
    .eq('id', adminData.medications.pet_id)
    .single()

  if (petError) {
    console.log('❌ Public CANNOT read pets table directly')
    console.log('  Error:', petError.message)
    console.log('  Code:', petError.code)
    console.log('\n🚨 THIS IS THE PROBLEM!')
    console.log('   RLS policy on pets table is blocking public access')
  } else {
    console.log('✅ Public CAN read pets table')
    console.log('  Pet name:', petData?.name)
  }
}

console.log('\n' + '='.repeat(80))
console.log('📝 NEXT STEPS:')
console.log('If any tests above show "CANNOT read", you need to:')
console.log('1. Run fix-magic-link-rls.sql in Supabase SQL Editor')
console.log('2. Verify policies were created')
console.log('3. Re-run this test to confirm public access works')
console.log('='.repeat(80))
