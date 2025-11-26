import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkRLSPolicies() {
  console.log('🔍 CHECKING RLS POLICIES')
  console.log('='.repeat(80))

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
      FROM pg_policies
      WHERE tablename IN ('medications', 'pets', 'medication_doses')
      ORDER BY tablename, policyname;
    `
  })

  if (error) {
    console.log('❌ Error querying policies:', error.message)
    console.log('\n📝 Run this SQL directly in Supabase SQL Editor:')
    console.log(`
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('medications', 'pets', 'medication_doses')
ORDER BY tablename, policyname;
    `)
    return
  }

  console.log('\n📋 RLS POLICIES:\n')

  if (!data || data.length === 0) {
    console.log('❌ No policies found!')
  } else {
    for (const policy of data) {
      console.log('─'.repeat(80))
      console.log('Table:', policy.tablename)
      console.log('Policy:', policy.policyname)
      console.log('Roles:', policy.roles)
      console.log('Command:', policy.cmd)
      console.log('Qual:', policy.qual)
    }
  }

  console.log('\n' + '='.repeat(80))
}

checkRLSPolicies().catch(console.error)
