import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testMedicationReminderSystem() {
  console.log('='.repeat(80))
  console.log('MEDICATION REMINDER SYSTEM TEST')
  console.log('='.repeat(80))
  console.log()

  // Get current time in PST
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const currentHour = nowPST.hour
  const currentMinute = nowPST.minute
  const currentTime = String(currentHour).padStart(2, '0') + ':' + String(currentMinute).padStart(2, '0')
  const today = nowPST.toISODate()

  console.log('📅 CURRENT TIME (PST):')
  console.log('   Full timestamp: ' + nowPST.toISO())
  console.log('   Time: ' + currentTime)
  console.log('   Date: ' + today)
  console.log()

  // Query all medications with reminder times
  const { data: medications, error: medsError } = await supabase
    .from('medications')
    .select('*, pets(name, species), profiles(phone, email, sms_opt_in)')
    .not('reminder_times', 'is', null)

  if (medsError) {
    console.error('❌ ERROR fetching medications:', medsError)
    return
  }

  if (!medications || medications.length === 0) {
    console.log('⚠️  NO MEDICATIONS WITH REMINDERS FOUND')
    console.log('   Create a medication with reminder times to test the system.')
    return
  }

  console.log('✅ FOUND ' + medications.length + ' MEDICATION(S) WITH REMINDERS')
  console.log()

  let activeMeds = 0
  let wouldTriggerNow = 0

  for (const med of medications) {
    const petName = med.pets?.name || 'Unknown Pet'
    const medName = med.medication_name || 'Unknown Medication'

    console.log('-'.repeat(80))
    console.log('🐾 PET: ' + petName)
    console.log('💊 MEDICATION: ' + medName)
    console.log('   ID: ' + med.id)
    console.log()

    // Check if medication is active (within start/end date range)
    const startDate = med.start_date
    const endDate = med.end_date
    const isActive = startDate <= today && (!endDate || endDate >= today)

    console.log('📆 DATE RANGE:')
    console.log('   Start: ' + startDate)
    console.log('   End: ' + (endDate || 'Ongoing'))
    console.log('   Status: ' + (isActive ? '✅ ACTIVE' : '❌ INACTIVE'))
    console.log()

    if (!isActive) {
      console.log('   ⏭️  Skipping - medication not active')
      continue
    }

    activeMeds++

    // Check reminder times
    const reminderTimes = Array.isArray(med.reminder_times) ? med.reminder_times : []
    console.log('⏰ REMINDER TIMES (' + reminderTimes.length + '):')

    if (reminderTimes.length === 0) {
      console.log('   ⚠️  No reminder times set')
    } else {
      reminderTimes.forEach((time, idx) => {
        const isPSTFormat = /^\d{2}:\d{2}$/.test(time)
        const matchesNow = time === currentTime

        if (matchesNow) {
          console.log('   ' + (idx + 1) + '. ' + time + ' ⭐ WOULD TRIGGER NOW!')
        } else {
          console.log('   ' + (idx + 1) + '. ' + time + ' ' + (isPSTFormat ? '✅' : '❌ INVALID FORMAT'))
        }
      })
    }
    console.log()

    // Check if user has phone and SMS opt-in
    const profile = med.profiles
    const hasPhone = profile && profile.phone
    const hasOptIn = profile && profile.sms_opt_in !== false

    console.log('📱 USER INFO:')
    console.log('   Phone: ' + (profile?.phone || 'Not set'))
    console.log('   Email: ' + (profile?.email || 'Not set'))
    console.log('   SMS Opt-in: ' + (hasOptIn ? '✅ Yes' : '❌ No'))
    console.log()

    // Check if any reminder time matches current time
    const shouldSendNow = reminderTimes.some(time => {
      const parts = time.split(':')
      const hour = parts[0]
      const minute = parts[1]
      return hour === String(currentHour).padStart(2, '0') &&
             minute === String(currentMinute).padStart(2, '0')
    })

    if (shouldSendNow) {
      console.log('🎯 TRIGGER STATUS: WOULD SEND NOW')
      wouldTriggerNow++

      if (!hasPhone || !hasOptIn) {
        console.log('   ⚠️  But BLOCKED due to missing phone or SMS opt-out')
      } else {
        // Check if already sent today
        const { data: logCheck } = await supabase
          .from('medication_reminders_log')
          .select('id')
          .eq('medication_id', med.id)
          .eq('reminder_date', today)
          .eq('reminder_time', currentTime)

        if (logCheck && logCheck.length > 0) {
          console.log('   ⚠️  Already sent today (found in log)')
        } else {
          console.log('   ✅ WOULD SEND SMS TO: ' + profile.phone)
          const deepLink = 'https://pet-claim-helper.vercel.app/dose/' + med.id + '?action=mark'
          console.log('   📲 Message: 🐾 Time to give ' + petName + ' their ' + medName + '!')
          console.log('   🔗 Deep link: ' + deepLink)
        }
      }
    } else {
      console.log('⏸️  TRIGGER STATUS: Not scheduled for current time')

      // Find next scheduled reminder
      const nextReminder = reminderTimes
        .map(time => {
          const parts = time.split(':').map(n => Number(n))
          const h = parts[0]
          const m = parts[1]
          let nextTime = nowPST.set({ hour: h, minute: m, second: 0 })
          if (nextTime <= nowPST) {
            nextTime = nextTime.plus({ days: 1 })
          }
          return { time: time, datetime: nextTime }
        })
        .sort((a, b) => a.datetime.toMillis() - b.datetime.toMillis())[0]

      if (nextReminder) {
        const diff = nextReminder.datetime.diff(nowPST, ['hours', 'minutes'])
        const hours = Math.floor(diff.hours)
        const minutes = Math.floor(diff.minutes % 60)
        console.log('   Next reminder: ' + nextReminder.time + ' (in ' + hours + 'h ' + minutes + 'm)')
      }
    }
    console.log()
  }

  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log('Total medications with reminders: ' + medications.length)
  console.log('Active medications: ' + activeMeds)
  console.log('Would trigger at current time: ' + wouldTriggerNow)
  console.log()

  if (activeMeds === 0) {
    console.log('⚠️  No active medications found. Create a medication with:')
    console.log('   - start_date <= today')
    console.log('   - end_date >= today (or null)')
    console.log('   - reminder_times array with PST times (e.g., ["07:00", "19:00"])')
  }

  if (wouldTriggerNow === 0) {
    console.log('💡 TIP: To test SMS sending, create a medication with:')
    console.log('   - reminder_times including current time: ["' + currentTime + '"]')
    console.log('   - start_date: today or earlier')
    console.log('   - end_date: today or later (or null)')
    console.log('   - User must have phone number and SMS opt-in enabled')
  }
  console.log()
}

testMedicationReminderSystem()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Test failed:', err)
    process.exit(1)
  })
