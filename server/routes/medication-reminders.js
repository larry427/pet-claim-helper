import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const router = Router()

// Supabase client will be initialized inside the route to ensure env is ready

const APP_URL = process.env.APP_URL || 'https://app.petclaimhelper.com'

function isWithinWindow(now, candidate, windowMs) {
  const t = candidate.getTime()
  return t >= now.getTime() && t < (now.getTime() + windowMs)
}

function hhmm(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

router.post('/send', async (req, res) => {
  try {
    // Debug logging for env
    // eslint-disable-next-line no-console
    console.log('[medication-reminders] send invoked (SMS mode)', {
      hasTwilioSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
      hasTwilioToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
      hasFromNumber: Boolean(process.env.TWILIO_PHONE_NUMBER),
    })

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(500).json({ ok: false, error: 'Twilio environment variables not configured' })
    }

    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    // eslint-disable-next-line no-console
    console.log('[medication-reminders] Twilio ready:', {
      sidPrefix: String(process.env.TWILIO_ACCOUNT_SID).slice(0, 6),
      from: process.env.TWILIO_PHONE_NUMBER,
    })
    // Initialize Supabase service client now (env is ready at request time)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const windowMinutes = 15
    const windowMs = windowMinutes * 60 * 1000
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    // Fetch active medications: start_date <= today AND (end_date is null OR end_date >= today)
    const { data: meds, error: medsErr } = await supabase
      .from('medications')
      .select('id, user_id, pet_id, medication_name, dosage, frequency, reminder_times, start_date, end_date')
      .lte('start_date', todayStr)

    if (medsErr) throw medsErr
    // eslint-disable-next-line no-console
    console.log('[medication-reminders] Raw meds fetched:', meds?.length || 0, 'error:', medsErr)

    const due = []
    for (const m of meds || []) {
      // Filter out medications that have already ended (end_date < today)
      if (m.end_date && String(m.end_date) < todayStr) continue
      const schedule = Array.isArray(m.reminder_times) && m.reminder_times.length > 0
        ? m.reminder_times
        : (m.frequency === '1x daily' ? ['07:00'] : m.frequency === '2x daily' ? ['07:00','19:00'] : ['08:00','14:00','20:00'])

      // Consider today and next day (for near-midnight windows)
      const candidates = []
      for (const t of schedule) {
        const [hh, mm] = String(t).split(':').map(n => Number(n))
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0)
        candidates.push(today)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        candidates.push(tomorrow)
      }

      const endDate = m.end_date ? new Date(m.end_date) : null
      const startDate = m.start_date ? new Date(m.start_date) : null

      const match = candidates.find(c => {
        // Ensure candidate date falls within course window
        const cYmd = c.toISOString().slice(0,10)
        if (startDate && cYmd < m.start_date) return false
        if (endDate && cYmd > m.end_date) return false
        return isWithinWindow(now, c, windowMs)
      })

      if (match) due.push({ med: m, match })
    }

    // eslint-disable-next-line no-console
    console.log(`[medication-reminders] Found ${due.length} medications due for reminders`)
    if (due.length === 0) {
      return res.json({ ok: true, sent: 0, evaluated: meds?.length || 0 })
    }

    let sent = 0
    const failures = []
    for (const { med, match } of due) {
      try {
        // Fetch user phone (profiles)
        let userPhone = null
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', med.user_id)
            .single()
          userPhone = profile?.phone || null
        } catch {}
        if (!userPhone) throw new Error('Missing user phone')

        // Pet name
        let petName = 'Your pet'
        try {
          const { data: pet } = await supabase
            .from('pets')
            .select('name')
            .eq('id', med.pet_id)
            .single()
          if (pet?.name) petName = pet.name
        } catch {}
        const dosageSuffix = med.dosage ? ` (${med.dosage})` : ''
        const messageText = `Time for ${petName}'s ${med.medication_name}${dosageSuffix}. Mark given in Pet Claim Helper.`
        // Ensure phone is in +1 E.164 format for US numbers
        let phoneToSend = userPhone
        if (typeof phoneToSend === 'string' && !phoneToSend.startsWith('+')) {
          phoneToSend = '+1' + phoneToSend.replace(/\D/g, '')
        }
        // eslint-disable-next-line no-console
        console.log(`[medication-reminders] Processing ${med.medication_name} for ${userPhone}`)
        try {
          await twilioClient.messages.create({
            to: phoneToSend,
            from: process.env.TWILIO_PHONE_NUMBER,
            body: messageText,
          })
          // eslint-disable-next-line no-console
          console.log(`[medication-reminders] SMS sent successfully to ${userPhone}`)
        } catch (smsErr) {
          // eslint-disable-next-line no-console
          console.error('[medication-reminders] Twilio error details:', smsErr && (smsErr.stack || smsErr))
          throw new Error(`Twilio SMS error: ${smsErr?.message || smsErr}`)
        }

        // Log
        try {
          await supabase.from('medication_reminders_log').insert({
            medication_id: med.id,
            user_id: med.user_id,
            reminder_date: match.toISOString().slice(0,10),
            reminder_time: hhmm(match),
          })
        } catch (logErr) {
          // eslint-disable-next-line no-console
          console.error('[medication-reminders] log error', logErr)
        }

        sent++
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[medication-reminders] SMS send error', err)
        failures.push(String(err?.message || err))
      }
    }

    return res.json({ ok: true, sent, failures, evaluated: due.length })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[medication-reminders] fatal error', err)
    return res.status(500).json({ ok: false, error: String(err?.message || err) })
  }
})

export default router


