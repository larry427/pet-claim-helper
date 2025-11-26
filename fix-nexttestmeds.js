import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { DateTime } from 'luxon'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixNextTestMeds() {
  console.log('🔧 FIXING nexttestmeds MEDICATION')
  console.log('='.repeat(80))

  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const todayPST = nowPST.toISODate()

  console.log('Current PST date:', todayPST)

  // Update the medication to start today instead of tomorrow
  const { data, error } = await supabase
    .from('medications')
    .update({ start_date: todayPST })
    .eq('medication_name', 'nexttestmeds')
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
    console.log('   Reminder time:', data[0].reminder_times[0])
    console.log('\n📅 The medication is now set to start TODAY')
    console.log('⏰ It should fire at the next scheduled time!')
  } else {
    console.log('❌ No medication found with name "nexttestmeds"')
  }
}

fixNextTestMeds().catch(console.error)
