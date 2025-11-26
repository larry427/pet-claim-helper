import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixTestSmsMeds() {
  console.log('🔧 FIXING testsmsmeds MEDICATION')
  console.log('='.repeat(80))

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const todayPST = nowPST.toISODate()

  console.log('Current PST date:', todayPST)

  // Update the medication to start today instead of tomorrow
  const { data, error } = await supabase
    .from('medications')
    .update({ start_date: todayPST })
    .eq('medication_name', 'testsmsmeds')
    .select()

  if (error) {
    console.error('❌ Error updating medication:', error)
    return
  }

  if (data && data.length > 0) {
    console.log('✅ Successfully updated medication:')
    console.log('   Medication ID:', data[0].id)
    console.log('   Old start_date: 2025-11-15')
    console.log('   New start_date:', data[0].start_date)
    console.log('\n📅 The medication is now set to start TODAY')
    console.log('⏰ Next reminder: 8:10 PM PST')
    console.log('\n⚠️  NOTE: The 8:10 PM reminder already passed today.')
    console.log('   To test immediately, update reminder_times to a few minutes from now.')
    console.log('   Current time:', nowPST.toFormat('HH:mm'))
  } else {
    console.log('❌ No medication found with name "testsmsmeds"')
  }
}

fixTestSmsMeds().catch(console.error)
