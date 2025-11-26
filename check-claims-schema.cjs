const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  // Get a sample claim to see what columns exist
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  if (!data || data.length === 0) {
    console.log('\n❌ No claims found')
    return
  }
  
  console.log('\n✅ Claims table columns:')
  console.log(Object.keys(data[0]).sort())
}

checkSchema()
