import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const token = '3c94a1c8-4966-4868-8ff8-a2144127eee1'

console.log('🔍 TESTING RLS PUBLIC ACCESS')
console.log('='.repeat(80))
console.log('Token:', token)
console.log()

// Test 1: Service Role (should work)
console.log('TEST 1: Service Role Key (admin access)')
console.log('-'.repeat(80))
const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data: adminData, error: adminError } = await adminClient
  .from('medication_doses')
  .select('*, medications(*, pets(name, species))')
  .eq('one_time_token', token)
  .eq('status', 'pending')
  .single()

if (adminError) {
  console.log('❌ Admin query failed:', adminError.message)
} else {
  console.log('✅ Admin can access dose')
  console.log('  Medication:', adminData.medications?.medication_name)
  console.log('  Pet:', adminData.medications?.pets?.name)
}

// Test 2: Anon Key (public access - this is what frontend uses)
console.log('\nTEST 2: Anon Key (public/unauthenticated access)')
console.log('-'.repeat(80))
const publicClient = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const { data: publicData, error: publicError } = await publicClient
  .from('medication_doses')
  .select('*, medications(*, pets(name, species))')
  .eq('one_time_token', token)
  .eq('status', 'pending')
  .single()

if (publicError) {
  console.log('❌ PUBLIC ACCESS BLOCKED!')
  console.log('  Error:', publicError.message)
  console.log('  Code:', publicError.code)
  console.log('  Details:', publicError.details)
  console.log()
  console.log('🚨 ROOT CAUSE: RLS policy is blocking public access')
  console.log('📝 FIX: Run this SQL in Supabase:')
  console.log()
  console.log('CREATE POLICY "Allow select with valid token"')
  console.log('ON medication_doses')
  console.log('FOR SELECT')
  console.log('TO public')
  console.log('USING (true);')
  console.log()
  console.log('Or run: add-token-rls-policy.sql')
} else {
  console.log('✅ PUBLIC ACCESS WORKS!')
  console.log('  Medication:', publicData.medications?.medication_name)
  console.log('  Pet:', publicData.medications?.pets?.name)
  console.log()
  console.log('✅ Magic links should work in production!')
}

console.log('\n' + '='.repeat(80))
