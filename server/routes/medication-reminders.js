import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const router = Router()

// Supabase client will be initialized inside the route to ensure env is ready

const APP_URL = process.env.APP_URL || 'https://app.petclaimhelper.com'
const MAIL_FROM = process.env.MAIL_FROM || 'Pet Claim Helper <noreply@petclaimhelper.com>'

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
    console.log('[medication-reminders] send invoked', {
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      keyPreview: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.slice(0, 6) : null,
    })

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ ok: false, error: 'RESEND_API_KEY not configured' })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
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
      .or(`end_date.is.null,end_date.gte.${todayStr}`)

    if (medsErr) throw medsErr

    const due = []
    for (const m of meds || []) {
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

    if (due.length === 0) {
      return res.json({ ok: true, sent: 0, evaluated: meds?.length || 0 })
    }

    let sent = 0
    const failures = []
    for (const { med, match } of due) {
      try {
        // Fetch user email (profiles), fallback to auth.user
        let userEmail = null
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', med.user_id)
            .single()
          userEmail = profile?.email || null
        } catch {}
        if (!userEmail) {
          const { data: authUser } = await supabase.auth.admin.getUserById(med.user_id)
          userEmail = authUser?.user?.email || null
        }
        if (!userEmail) throw new Error('Missing user email')

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

        // Progress
        const { count: givenCount = 0 } = await supabase
          .from('medication_doses')
          .select('*', { count: 'exact', head: true })
          .eq('medication_id', med.id)
          .eq('status', 'given')

        const start = new Date(med.start_date)
        const end = med.end_date ? new Date(med.end_date) : null
        const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        const endDay = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : null
        const days = endDay ? Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1) : 1
        const tpd = (Array.isArray(med.reminder_times) && med.reminder_times.length > 0) ? med.reminder_times.length : (med.frequency === '1x daily' ? 1 : med.frequency === '2x daily' ? 2 : 3)
        const total = days * tpd

        const subject = `Time to give ${petName} their ${med.medication_name}`
        const trackUrl = `${APP_URL}/?medicationId=${med.id}#medications`
        const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding:16px;">
    <h2 style="margin:0 0 8px;">⏰ Time to give ${petName} their ${med.medication_name}</h2>
    <p style="color:#334155;margin:4px 0;">Dosage: <strong>${med.dosage || '—'}</strong></p>
    <p style="color:#334155;margin:4px 0;">Progress: <strong>${givenCount}/${total} doses</strong></p>
    <p style="color:#334155;margin:12px 0;">Scheduled time: <strong>${match.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong></p>
    <a href="${trackUrl}" style="display:inline-block;margin-top:16px;background:#059669;color:white;padding:12px 16px;border-radius:10px;text-decoration:none;">TRACK DOSE</a>
  </div>`

        const { error: emailErr } = await resend.emails.send({ from: MAIL_FROM, to: [userEmail], subject, html })
        if (emailErr) throw emailErr

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
        console.error('[medication-reminders] send error', err)
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


