const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkScrappy() {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name, insurance_company, filing_deadline_days')
    .ilike('name', '%scrappy%')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('\nScrappy pet records:')
    console.table(data)
  }
}

checkScrappy()
