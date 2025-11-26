require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

// Use service role key to bypass RLS and see database structure
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkConstraints() {
  console.log('Checking claims table constraints that could cause 409 errors...\n')

  try {
    // 1. Check if we can insert a test claim
    console.log('1. Testing basic insert (will rollback)...')
    const testClaim = {
      user_id: '00000000-0000-0000-0000-000000000000', // Fake UUID
      service_date: '2025-01-15',
      visit_title: 'Test Claim',
      total_amount: 100.00,
      filing_status: 'not_filed',
      expense_category: 'insured'
    }

    const { data: insertTest, error: insertError } = await supabase
      .from('claims')
      .insert(testClaim)
      .select()

    if (insertError) {
      console.error('❌ Insert failed:', insertError.message)
      console.error('Error code:', insertError.code)
      console.error('Error details:', insertError.details)
      console.error('Error hint:', insertError.hint)
    } else {
      console.log('✅ Insert succeeded (cleaning up...)')
      // Delete the test claim
      await supabase.from('claims').delete().eq('id', insertTest[0].id)
    }

    console.log('\n2. Checking for unique constraints...')
    const { data: uniqueData, error: uniqueError } = await supabase
      .rpc('get_table_constraints', { table_name: 'claims' })
      .select()

    if (uniqueError) {
      console.log('Cannot query constraints via RPC (may require service role)')
      console.log('Error:', uniqueError.message)
    } else {
      console.log('Unique constraints:', uniqueData)
    }

    console.log('\n3. Checking RLS policies...')
    // Try to see if RLS is blocking inserts
    const { data: rlsData, error: rlsError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'claims')

    if (rlsError) {
      console.log('Cannot query RLS policies directly')
    } else {
      console.log('RLS policies found:', rlsData?.length || 0)
    }

    console.log('\n4. Checking for foreign key violations...')
    // The user_id and pet_id foreign keys could cause issues
    console.log('Foreign keys in claims table:')
    console.log('- user_id -> profiles(id) ON DELETE CASCADE')
    console.log('- pet_id -> pets(id) ON DELETE CASCADE')
    console.log('\n💡 If 409 occurs: Check that user_id and pet_id exist in their tables')

  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

checkConstraints()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
