import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function deleteTestClaims() {
  console.log('Deleting test claims...\n')
  
  const claimIds = [
    'acfb83d4-4d09-4c04-b30d-48258ed94fda',
    'afc1617a-ace7-4b46-bb61-c16d831e17b4',
    '93062d4e-0a10-4080-a7fa-34349e0c50b7'
  ]
  
  for (const id of claimIds) {
    const { error } = await supabase
      .from('claims')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.log(`  ❌ Error deleting ${id}:`, error.message)
    } else {
      console.log(`  ✅ Deleted claim ${id}`)
    }
  }
  
  console.log('\n✅ Test claims deleted')
}

deleteTestClaims().then(() => process.exit(0))
