const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function checkSchema() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  // Get a sample pet to see the schema
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (data && data.length > 0) {
    console.log('Pets table columns:')
    console.log(Object.keys(data[0]))
  } else {
    console.log('No pets found in database')
  }
}

checkSchema().catch(console.error)
