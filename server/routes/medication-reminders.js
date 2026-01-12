// Medication reminders logic with SMS support
import { sendTwilioSMS } from '../utils/sendTwilioSMS.js'
import { DateTime } from 'luxon'

export async function runMedicationReminders(options = {}) {
  const { supabase } = options

  if (!supabase) {
    console.error('[Medication Reminders] No supabase client provided')
    return { ok: false, error: 'No supabase client provided' }
  }

  // FIX #3: DISTRIBUTED LOCKING - Prevent multiple instances from running simultaneously
  const lockKey = 'medication_reminders_cron_lock'
  const lockDuration = 120 // 2 minutes
  const crypto = await import('crypto')
  const lockId = crypto.randomUUID()

  try {
    console.log('[Medication Reminders] Attempting to acquire distributed lock...')

    // Try to acquire lock
    const nowPST = DateTime.now().setZone('America/Los_Angeles')
    const lockExpiresAt = nowPST.plus({ seconds: lockDuration }).toISO()

    const { data: existingLock, error: lockCheckError } = await supabase
      .from('medication_reminders_log')
      .select('id')
      .eq('medication_id', lockKey) // Use medication_id as lock key
      .gte('sent_at', nowPST.minus({ seconds: lockDuration }).toISO())
      .limit(1)
      .single()

    if (existingLock) {
      console.log('[Medication Reminders] 🔒 Lock already held by another instance, skipping...')
      return { ok: true, message: 'Skipped - another instance is running', sent: 0 }
    }

    // Acquire lock by inserting a record
    // Note: We use a special "lock" entry that's not tied to a real medication
    const { error: lockAcquireError } = await supabase
      .rpc('acquire_reminder_lock', {
        lock_id: lockId,
        lock_key: lockKey,
        lock_expires: lockExpiresAt
      })
      .then(() => ({ error: null }), async () => {
        // If RPC doesn't exist, try direct insert (may fail due to FK constraints)
        // Use the first available user as a workaround
        const { data: anyUser } = await supabase
          .from('profiles')
          .select('id')
          .limit(1)
          .single()

        if (!anyUser) {
          return { error: new Error('No users found for lock') }
        }

        return await supabase
          .from('medication_reminders_log')
          .insert({
            id: lockId,
            medication_id: lockKey,
            user_id: anyUser.id, // Use first user as dummy
            reminder_date: nowPST.toISODate(),
            reminder_time: 'LOCK',
            message_id: `lock_${lockId}`
          })
      })

    if (lockAcquireError) {
      console.log('[Medication Reminders] ⚠️  Could not acquire lock (race condition), skipping...')
      return { ok: true, message: 'Skipped - race condition', sent: 0 }
    }

    console.log('[Medication Reminders] ✅ Lock acquired:', lockId)

    // Proceed with reminder processing
    console.log('[Medication Reminders] Starting medication reminder check...')

    // Get current time in PST (America/Los_Angeles)
    const currentHour = nowPST.hour
    const currentMinute = nowPST.minute
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

    console.log('[Medication Reminders] Current time (PST):', currentTime, '| Full PST time:', nowPST.toISO())

    // Auto-skip doses that are more than 24 hours old
    const twentyFourHoursAgo = nowPST.minus({ hours: 24 }).toISO()
    const { data: skippedDoses, error: skipError } = await supabase
      .from('medication_doses')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('scheduled_time', twentyFourHoursAgo)
      .select()

    if (skipError) {
      console.error('[Medication Reminders] Error auto-skipping old doses:', skipError.message)
    } else if (skippedDoses?.length > 0) {
      console.log(`[Medication Reminders] Auto-skipped ${skippedDoses.length} old pending doses`)
    }

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
      console.log('[DEBUG] Processing medication:', med.medication_name, '| reminder_times:', med.reminder_times, '| pet:', med.pets?.name)

      // Check if medication is active (within start/end date range)
      // Use PST date for consistent timezone handling
      // Note: null end_date means "ongoing" medication
      const today = nowPST.toISODate()
      if (med.start_date > today) {
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: Not started yet (start_date:', med.start_date, 'today:', today, ')')
        remindersSkipped.push({ medicationId: med.id, reason: 'Not started yet' })
        continue
      }
      if (med.end_date !== null && med.end_date < today) {
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: Already ended (end_date:', med.end_date, 'today:', today, ')')
        remindersSkipped.push({ medicationId: med.id, reason: 'Already ended' })
        continue
      }

      // Check if user has phone and SMS opt-in
      const profile = med.profiles
      const userPhone = profile?.phone || 'NO PHONE'
      const smsOptIn = profile?.sms_opt_in
      console.log('[DEBUG] User phone for', med.medication_name, ':', userPhone, '| SMS opt-in:', smsOptIn)

      if (!profile || !profile.phone || profile.sms_opt_in === false) {
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: No phone or opted out (phone:', userPhone, 'opt_in:', smsOptIn, ')')
        remindersSkipped.push({ medicationId: med.id, reason: 'No phone or opted out' })
        continue
      }

      // Check if reminder should fire based on frequency type
      const reminderConfig = med.reminder_times
      let shouldSendNow = false
      let matchedTime = null // Capture the actual reminder time that matched

      if (Array.isArray(reminderConfig)) {
        // OLD FORMAT: Daily - array of times like ["08:00", "20:00"]
        console.log('[DEBUG] Daily format detected - checking times:', reminderConfig)
        matchedTime = reminderConfig.find(time => {
          const [hour, minute] = time.split(':')
          const matches = hour === String(currentHour).padStart(2, '0') &&
                 minute === String(currentMinute).padStart(2, '0')
          console.log('[DEBUG] Time', time, 'matches current', currentTime, '?', matches)
          return matches
        })
        shouldSendNow = !!matchedTime
      } else if (reminderConfig && typeof reminderConfig === 'object') {
        // NEW FORMAT: Object with type property
        const { type, dayOfWeek, dayOfMonth, time } = reminderConfig
        console.log('[DEBUG] New format detected - type:', type, 'dayOfWeek:', dayOfWeek, 'dayOfMonth:', dayOfMonth, 'time:', time)

        if (type === 'weekly') {
          // Weekly: Check if today's day of week matches AND current time matches
          const todayDayOfWeek = nowPST.weekday % 7 // 0=Sunday, 1=Monday, etc.
          const timeMatches = currentTime === time
          const dayMatches = todayDayOfWeek === dayOfWeek
          console.log('[DEBUG] Weekly check - today:', todayDayOfWeek, 'expected:', dayOfWeek, 'dayMatches:', dayMatches, 'timeMatches:', timeMatches)
          shouldSendNow = dayMatches && timeMatches
          if (shouldSendNow) matchedTime = time
        } else if (type === 'monthly') {
          // Monthly: Check if today's day of month matches AND current time matches
          const todayDayOfMonth = nowPST.day
          const timeMatches = currentTime === time
          const dayMatches = todayDayOfMonth === dayOfMonth
          console.log('[DEBUG] Monthly check - today:', todayDayOfMonth, 'expected:', dayOfMonth, 'dayMatches:', dayMatches, 'timeMatches:', timeMatches)
          shouldSendNow = dayMatches && timeMatches
          if (shouldSendNow) matchedTime = time
        } else if (type === 'quarterly') {
          // Quarterly: Check if current month is 3 months since start AND day matches AND time matches
          const startDate = DateTime.fromISO(med.start_date, { zone: 'America/Los_Angeles' })
          const monthsSinceStart = Math.floor(nowPST.diff(startDate, 'months').months)
          const isQuarterlyMonth = monthsSinceStart % 3 === 0
          const todayDayOfMonth = nowPST.day
          const timeMatches = currentTime === time
          const dayMatches = todayDayOfMonth === dayOfMonth
          console.log('[DEBUG] Quarterly check - monthsSinceStart:', monthsSinceStart, 'isQuarterlyMonth:', isQuarterlyMonth, 'dayMatches:', dayMatches, 'timeMatches:', timeMatches)
          shouldSendNow = isQuarterlyMonth && dayMatches && timeMatches
          if (shouldSendNow) matchedTime = time
        } else if (type === 'as_needed') {
          // As needed: Never send automatic reminders
          console.log('[DEBUG] As needed - skipping automatic reminder')
          shouldSendNow = false
        }
      }

      console.log('[DEBUG] Should send now for', med.medication_name, '?', shouldSendNow)

      if (!shouldSendNow) {
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: Not time yet')
        continue // Not time yet for this medication
      }

      // CRITICAL FIX: Insert log entry FIRST, then send SMS
      // The UNIQUE constraint on (medication_id, reminder_date, reminder_time) acts as an atomic lock
      // If two instances try to process the same medication, only the first insert succeeds
      // The second insert fails with a constraint violation, preventing duplicate SMS

      const { error: logInsertError } = await supabase
        .from('medication_reminders_log')
        .insert({
          medication_id: med.id,
          user_id: med.user_id,
          reminder_date: today,
          reminder_time: currentTime,
          message_id: null, // Will update after SMS is sent
          sent_at: nowPST.toISO()
        })

      if (logInsertError) {
        // UNIQUE constraint violation means another instance already sent this reminder
        if (logInsertError.code === '23505') {
          console.log('[DEBUG] Deduplication check for', med.medication_name, '- already sent today (constraint violation)')
          console.log(`[Medication Reminders] ✅ Skipping ${med.medication_name} - already sent by another instance`)
          remindersSkipped.push({ medicationId: med.id, reason: 'Already sent (constraint)' })
          continue
        }

        // Other error - log and skip
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: Log insert failed (error:', logInsertError.message, 'code:', logInsertError.code, ')')
        console.error('[Medication Reminders] Failed to insert log:', logInsertError.message)
        remindersSkipped.push({
          medicationId: med.id,
          reason: 'Log insert failed',
          error: logInsertError.message
        })
        continue
      }

      console.log('[DEBUG] Successfully inserted log entry for', med.medication_name, '- proceeding to send SMS')

      console.log(`[Medication Reminders] ✅ Claimed ${med.medication_name} - safe to send`)

      // Create a dose record (so we can generate a magic link token)
      // Build scheduled_time from the matched reminder time (not current time)
      const [schedHour, schedMinute] = matchedTime.split(':').map(Number)
      const scheduledTime = nowPST.set({ hour: schedHour, minute: schedMinute, second: 0, millisecond: 0 }).toISO()

      // Generate one-time token for magic link authentication
      const crypto = await import('crypto')
      const oneTimeToken = crypto.randomUUID()
      const tokenExpiresAt = nowPST.plus({ hours: 24 }).toISO() // Token valid for 24 hours

      // Generate 8-character alphanumeric short code for SMS URL
      // Format: uppercase, lowercase, and numbers (e.g., Xk7mP9ab)
      function generateShortCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let code = ''
        const randomBytes = crypto.randomBytes(8)
        for (let i = 0; i < 8; i++) {
          code += chars[randomBytes[i] % chars.length]
        }
        return code
      }

      const shortCode = generateShortCode()

      const { data: dose, error: doseError } = await supabase
        .from('medication_doses')
        .insert({
          medication_id: med.id,
          user_id: med.user_id,
          scheduled_time: scheduledTime,
          status: 'pending',
          one_time_token: oneTimeToken,
          token_expires_at: tokenExpiresAt,
          short_code: shortCode
        })
        .select()
        .single()

      if (doseError) {
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: Failed to create dose (error:', doseError.message, ')')
        console.error('[Medication Reminders] Error creating dose:', doseError)
        // We already logged, so delete the log entry to allow retry
        await supabase
          .from('medication_reminders_log')
          .delete()
          .eq('medication_id', med.id)
          .eq('reminder_date', today)
          .eq('reminder_time', currentTime)

        remindersSkipped.push({
          medicationId: med.id,
          reason: 'Failed to create dose',
          error: doseError.message
        })
        continue
      }

      console.log('[DEBUG] Created dose:', dose.id, 'for', med.medication_name, '- preparing SMS')
      console.log('[Medication Reminders] Created dose:', dose.id, 'with short code:', shortCode)

      // Build SMS message with short URL
      const petName = med.pets?.name || 'your pet'
      const medName = med.medication_name || 'medication'
      const deepLink = `https://pet-claim-helper.vercel.app/dose/${shortCode}`
      const message = `🐾 Time to give ${petName} their ${medName}! Tap to mark as given: ${deepLink} Reply HELP for help.`

      console.log('[DEBUG] Sending SMS to', profile.phone, 'for', med.medication_name)

      // Send SMS
      const result = await sendTwilioSMS(profile.phone, message)

      console.log('[DEBUG] SMS send result for', med.medication_name, '- success:', result.success, 'messageId:', result.messageId || 'none', 'error:', result.error || 'none')

      if (result.success) {
        // Update log with Twilio message SID
        await supabase
          .from('medication_reminders_log')
          .update({ message_id: result.messageId })
          .eq('medication_id', med.id)
          .eq('reminder_date', today)
          .eq('reminder_time', currentTime)

        console.log('[Medication Reminders] ✅ SMS sent and logged:', result.messageId)

        remindersSent.push({
          medicationId: med.id,
          petName,
          medName,
          phone: profile.phone,
          messageId: result.messageId,
          doseId: dose?.id
        })

        console.log('[Medication Reminders] Sent reminder:', {
          medicationId: med.id,
          petName,
          medName,
          messageId: result.messageId,
          doseId: dose?.id
        })
      } else {
        // SMS failed - delete log entry to allow retry
        console.log('[DEBUG] Skipping', med.medication_name, '- reason: SMS send failed (error:', result.error, ')')
        console.error('[Medication Reminders] SMS send failed, removing log entry for retry')
        await supabase
          .from('medication_reminders_log')
          .delete()
          .eq('medication_id', med.id)
          .eq('reminder_date', today)
          .eq('reminder_time', currentTime)

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

    // FIX #3: Release the distributed lock
    await supabase
      .from('medication_reminders_log')
      .delete()
      .eq('id', lockId)
    console.log('[Medication Reminders] 🔓 Lock released:', lockId)

    return {
      ok: true,
      sent: remindersSent.length,
      skipped: remindersSkipped.length,
      details: { remindersSent, remindersSkipped }
    }
  } catch (error) {
    console.error('[Medication Reminders] Unexpected error:', error)

    // FIX #3: Release lock on error
    try {
      await supabase
        .from('medication_reminders_log')
        .delete()
        .eq('id', lockId)
      console.log('[Medication Reminders] 🔓 Lock released on error:', lockId)
    } catch (lockErr) {
      console.error('[Medication Reminders] Failed to release lock:', lockErr.message)
    }

    return { ok: false, error: error.message }
  }
}

export default { runMedicationReminders }


