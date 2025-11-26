import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugDoseIssue() {
  console.log('=' .repeat(80))
  console.log('DOSE MARKING DEBUG - COMPREHENSIVE ANALYSIS')
  console.log('='.repeat(80))
  console.log()

  const MEDICATION_ID = '31716620-86bd-4889-b707-778c24c24749'
  const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

  // Get current PST time (matching what server does)
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const todayPST = nowPST.toISODate()

  console.log('🕒 CURRENT TIME (PST):')
  console.log('   Full ISO:', nowPST.toISO())
  console.log('   Date:', todayPST)
  console.log('   Time:', nowPST.toFormat('HH:mm:ss'))
  console.log()

  // 1. Check medication exists
  console.log('📋 STEP 1: Verify medication exists')
  const { data: medication, error: medError } = await supabase
    .from('medications')
    .select('*')
    .eq('id', MEDICATION_ID)
    .single()

  if (medError || !medication) {
    console.error('❌ Medication not found:', medError)
    return
  }

  console.log('✅ Medication found:')
  console.log('   ID:', medication.id)
  console.log('   Name:', medication.medication_name)
  console.log('   User ID:', medication.user_id)
  console.log('   Pet ID:', medication.pet_id)
  console.log('   Start date:', medication.start_date)
  console.log('   End date:', medication.end_date)
  console.log('   Reminder times:', medication.reminder_times)
  console.log()

  // 2. Check ALL doses for this medication
  console.log('💊 STEP 2: Check ALL doses for this medication')
  const { data: allDoses, error: allDosesError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', MEDICATION_ID)
    .order('scheduled_time', { ascending: true })

  if (allDosesError) {
    console.error('❌ Error fetching doses:', allDosesError)
  } else if (!allDoses || allDoses.length === 0) {
    console.log('⚠️  NO DOSES FOUND for this medication!')
    console.log('   This means doses were never created.')
    console.log('   Check if medication reminder system created doses.')
  } else {
    console.log(`✅ Found ${allDoses.length} dose(s):`)
    allDoses.forEach((dose, idx) => {
      console.log(`   ${idx + 1}. Dose ID: ${dose.id}`)
      console.log(`      Scheduled time: ${dose.scheduled_time}`)
      console.log(`      Status: ${dose.status}`)
      console.log(`      Given time: ${dose.given_time || 'NOT SET'}`)
      console.log(`      User ID: ${dose.user_id}`)
      console.log()
    })
  }
  console.log()

  // 3. Check pending doses for TODAY (PST)
  console.log('🎯 STEP 3: Check pending doses for TODAY (PST)')
  console.log('   Search range:', `${todayPST}T00:00:00 to ${todayPST}T23:59:59`)

  const { data: todayDoses, error: todayError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', MEDICATION_ID)
    .eq('user_id', LARRY_USER_ID)
    .eq('status', 'pending')
    .gte('scheduled_time', `${todayPST}T00:00:00`)
    .lt('scheduled_time', `${todayPST}T23:59:59`)
    .order('scheduled_time', { ascending: true })

  if (todayError) {
    console.error('❌ Error querying today\'s doses:', todayError)
  } else if (!todayDoses || todayDoses.length === 0) {
    console.log('⚠️  NO PENDING doses found for today (PST)')
    console.log('   Possible reasons:')
    console.log('   1. Dose was already marked as given')
    console.log('   2. Dose was created for a different date')
    console.log('   3. Dose was never created')
    console.log('   4. Timezone mismatch (check scheduled_time above)')
  } else {
    console.log(`✅ Found ${todayDoses.length} pending dose(s) for today:`)
    todayDoses.forEach((dose, idx) => {
      console.log(`   ${idx + 1}. Dose ID: ${dose.id}`)
      console.log(`      Scheduled time: ${dose.scheduled_time}`)
      console.log(`      Status: ${dose.status}`)
    })
  }
  console.log()

  // 4. Check user authentication
  console.log('👤 STEP 4: Verify user profile')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, phone')
    .eq('id', LARRY_USER_ID)
    .single()

  if (profileError || !profile) {
    console.error('❌ User profile not found:', profileError)
  } else {
    console.log('✅ User profile found:')
    console.log('   ID:', profile.id)
    console.log('   Email:', profile.email)
    console.log('   Phone:', profile.phone)
  }
  console.log()

  // 5. Simulate the server query
  console.log('🔍 STEP 5: Simulate exact server query')
  console.log('   This is what /api/medications/:id/mark-given does:')
  console.log()

  const { data: serverQuery, error: serverError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', MEDICATION_ID)
    .eq('user_id', LARRY_USER_ID)
    .eq('status', 'pending')
    .gte('scheduled_time', `${todayPST}T00:00:00`)
    .lt('scheduled_time', `${todayPST}T23:59:59`)
    .order('scheduled_time', { ascending: true })
    .limit(1)

  if (serverError) {
    console.error('❌ Server query error:', serverError)
  } else if (!serverQuery || serverQuery.length === 0) {
    console.log('❌ Server query returned 0 doses')
    console.log('   This is why you get "No pending dose found for today"')
  } else {
    console.log('✅ Server query would succeed:')
    console.log('   Dose ID:', serverQuery[0].id)
    console.log('   Scheduled time:', serverQuery[0].scheduled_time)
    console.log('   Status:', serverQuery[0].status)
  }
  console.log()

  // 6. Summary and recommendations
  console.log('='.repeat(80))
  console.log('SUMMARY & RECOMMENDATIONS')
  console.log('='.repeat(80))

  if (!allDoses || allDoses.length === 0) {
    console.log('❌ ROOT CAUSE: No doses exist for this medication')
    console.log()
    console.log('EXPLANATION:')
    console.log('The medication reminder system sends SMS but doesn\'t create doses.')
    console.log('The deep link expects a dose to exist in medication_doses table.')
    console.log()
    console.log('SOLUTION OPTIONS:')
    console.log('1. Create doses when SMS is sent')
    console.log('2. Allow marking doses without pre-existing dose record')
    console.log('3. Create doses in advance (daily batch job)')
  } else {
    const pendingToday = allDoses.filter(d =>
      d.status === 'pending' &&
      d.scheduled_time >= `${todayPST}T00:00:00` &&
      d.scheduled_time < `${todayPST}T23:59:59`
    )

    if (pendingToday.length === 0) {
      console.log('❌ ROOT CAUSE: No pending doses for today')
      console.log()
      console.log('Doses exist but none are pending for today (PST).')
      console.log('Check scheduled_time values above - might be different date.')
    } else {
      console.log('✅ System should work - pending doses exist for today')
      console.log()
      console.log('If still getting errors:')
      console.log('1. Check authentication - user must be logged in')
      console.log('2. Check Render logs for actual error')
      console.log('3. Verify deployed code has PST fix')
    }
  }

  console.log()
}

debugDoseIssue()
  .then(() => {
    console.log('✅ Debug completed')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Debug failed:', err)
    process.exit(1)
  })
