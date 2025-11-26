import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  console.log('Checking medication_doses table schema...\n')

  // Try to query with all possible columns to see what exists
  const { data, error } = await supabase
    .from('medication_doses')
    .select('*')
    .limit(0)

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Table exists (even if empty)')
  }

  // Try a simple insert to see what columns are actually required/available
  const { data: testInsert, error: testError } = await supabase
    .from('medication_doses')
    .insert({
      medication_id: '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000',
      scheduled_time: new Date().toISOString(),
      status: 'pending'
    })
    .select()

  if (testError) {
    console.log('\nTest insert error (this shows what columns are needed):')
    console.log(testError)
  } else {
    console.log('\nTest insert succeeded! Schema:')
    console.log(Object.keys(testInsert[0]))

    // Clean up test record
    await supabase
      .from('medication_doses')
      .delete()
      .eq('id', testInsert[0].id)
  }
}

checkSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed:', err)
    process.exit(1)
  })
