const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hyrgqrgeshkgvsfwnzzu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cmdxcmdlc2hrZ3ZzZnduenp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE1NTc1MSwiZXhwIjoyMDc2NzMxNzUxfQ.UsqGmuoOUDdXKwEbY6jMFYq3je1oh9eEgEIbgchcLLw'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkRLS() {
  console.log('Checking RLS on medication_doses table...\n')

  // Check if RLS is enabled
  const { data: rlsCheck, error: rlsError } = await supabase.rpc('exec_sql', {
    sql: `SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'medication_doses';`
  })

  if (rlsError) {
    console.error('Error checking RLS:', rlsError)
    console.log('\nTrying alternative query...')

    // Alternative: Check policies directly
    const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE tablename = 'medication_doses';
      `
    })

    if (policyError) {
      console.error('Error checking policies:', policyError)
      console.log('\n🔴 DIAGNOSIS: Cannot query RLS status')
      console.log('The backend is using SUPABASE_SERVICE_ROLE_KEY which BYPASSES RLS')
      console.log('So RLS is NOT the issue.')
      return
    }

    console.log('\n📋 Policies on medication_doses:')
    console.log(JSON.stringify(policies, null, 2))
    return
  }

  console.log('✅ RLS Status:', rlsCheck)

  // Check policies
  const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE tablename = 'medication_doses';
    `
  })

  if (policyError) {
    console.error('Error checking policies:', policyError)
  } else {
    console.log('\n📋 Policies:', policies)
  }
}

checkRLS().catch(console.error)
