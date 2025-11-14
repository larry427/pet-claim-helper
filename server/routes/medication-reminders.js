// Medication reminders logic with SMS support
import { sendTwilioSMS } from '../utils/sendTwilioSMS.js'
import { DateTime } from 'luxon'

export async function runMedicationReminders(options = {}) {
  const { supabase } = options

  if (!supabase) {
    console.error('[Medication Reminders] No supabase client provided')
    return { ok: false, error: 'No supabase client provided' }
  }

  try {
    console.log('[Medication Reminders] Starting medication reminder check...')

    // Get current time in PST (America/Los_Angeles)
    const nowPST = DateTime.now().setZone('America/Los_Angeles')
    const currentHour = nowPST.hour
    const currentMinute = nowPST.minute
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

    console.log('[Medication Reminders] Current time (PST):', currentTime, '| Full PST time:', nowPST.toISO())

    // Query all active medications with reminder times
    const { data: medications, error: medsError } = await supabase
      .from('medications')
      .select('*, pets(name, species), profiles(phone, email, sms_opt_in)')
      .not('reminder_times', 'is', null)

    if (medsError) {
      console.error('[Medication Reminders] Error fetching medications:', medsError)
      return { ok: false, error: medsError.message }
    }

    if (!medications || medications.length === 0) {
      console.log('[Medication Reminders] No medications with reminders found')
      return { ok: true, message: 'No medications with reminders found', sent: 0 }
    }

    console.log(`[Medication Reminders] Found ${medications.length} medications with reminders`)

    const remindersSent = []
    const remindersSkipped = []

    // Check each medication to see if it's time to send a reminder
    for (const med of medications) {
      // Check if medication is active (within start/end date range)
      // Use PST date for consistent timezone handling
      const today = nowPST.toISODate()
      if (med.start_date > today) {
        remindersSkipped.push({ medicationId: med.id, reason: 'Not started yet' })
        continue
      }
      if (med.end_date && med.end_date < today) {
        remindersSkipped.push({ medicationId: med.id, reason: 'Already ended' })
        continue
      }

      // Check if user has phone and SMS opt-in
      const profile = med.profiles
      if (!profile || !profile.phone || profile.sms_opt_in === false) {
        remindersSkipped.push({ medicationId: med.id, reason: 'No phone or opted out' })
        continue
      }

      // Check if any reminder time matches current time
      const reminderTimes = Array.isArray(med.reminder_times) ? med.reminder_times : []
      const shouldSendNow = reminderTimes.some(time => {
        // Compare hour and minute (ignore seconds)
        const [hour, minute] = time.split(':')
        return hour === String(currentHour).padStart(2, '0') &&
               minute === String(currentMinute).padStart(2, '0')
      })

      if (!shouldSendNow) {
        continue // Not time yet for this medication
      }

      // Check if we already sent a reminder for this medication today
      const { data: logCheck } = await supabase
        .from('medication_reminders_log')
        .select('id')
        .eq('medication_id', med.id)
        .eq('reminder_date', today)
        .eq('reminder_time', currentTime)

      if (logCheck && logCheck.length > 0) {
        remindersSkipped.push({ medicationId: med.id, reason: 'Already sent today' })
        continue
      }

      // Build SMS message with deep link
      const petName = med.pets?.name || 'your pet'
      const medName = med.medication_name || 'medication'
      const deepLink = `https://pet-claim-helper.vercel.app/dose/${med.id}?action=mark`
      const message = `🐾 Time to give ${petName} their ${medName}! Tap to mark as given: ${deepLink} Reply HELP for help.`

      // Send SMS
      const result = await sendTwilioSMS(profile.phone, message)

      if (result.success) {
        // Log the sent reminder
        await supabase
          .from('medication_reminders_log')
          .insert({
            medication_id: med.id,
            user_id: med.user_id,
            reminder_date: today,
            reminder_time: currentTime
          })

        remindersSent.push({
          medicationId: med.id,
          petName,
          medName,
          phone: profile.phone,
          messageId: result.messageId
        })

        console.log('[Medication Reminders] Sent reminder:', {
          medicationId: med.id,
          petName,
          medName,
          messageId: result.messageId
        })
      } else {
        remindersSkipped.push({
          medicationId: med.id,
          reason: 'SMS send failed',
          error: result.error
        })

        console.error('[Medication Reminders] Failed to send:', {
          medicationId: med.id,
          error: result.error
        })
      }
    }

    console.log('[Medication Reminders] Summary:', {
      sent: remindersSent.length,
      skipped: remindersSkipped.length
    })

    return {
      ok: true,
      sent: remindersSent.length,
      skipped: remindersSkipped.length,
      details: { remindersSent, remindersSkipped }
    }
  } catch (error) {
    console.error('[Medication Reminders] Unexpected error:', error)
    return { ok: false, error: error.message }
  }
}

export default { runMedicationReminders }


