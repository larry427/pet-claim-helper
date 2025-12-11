const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function updateScrappy() {
  console.log('Updating Scrappy\'s filing_deadline_days to 270...')
  
  const { data, error } = await supabase
    .from('pets')
    .update({ filing_deadline_days: 270 })
    .eq('name', 'Scrappy')
    .select()
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('\nUpdated successfully:')
    console.table(data)
  }
}

updateScrappy()
