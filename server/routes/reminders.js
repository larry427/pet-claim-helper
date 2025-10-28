import { Router } from 'express'
import { resend, ensureResendConfigured } from '../lib/resendClient.js'
import { buildReminderHtml, buildReminderText, buildReminderSubject } from '../templates/reminderEmail.js'

const router = Router()

router.post('/send-reminders', async (req, res) => {
  try {
    ensureResendConfigured()
    const { to, sample } = req.body || {}
    // Simple test send path first; real scanning will be added next step
    if (sample && to) {
      const html = buildReminderHtml({ petName: 'Jessi', serviceDate: '2025-09-23', amount: 326.4, deadline: '2025-12-22', daysRemaining: 10, claimUrl: 'https://app.petclaimhelper.com/claims' })
      const text = buildReminderText({ petName: 'Jessi', serviceDate: '2025-09-23', amount: 326.4, deadline: '2025-12-22', daysRemaining: 10, claimUrl: 'https://app.petclaimhelper.com/claims' })
      const subject = buildReminderSubject({ petName: 'Jessi', daysRemaining: 10 })
      const from = process.env.MAIL_FROM || 'Pet Claim Helper <noreply@your-domain>'
      const result = await resend.emails.send({ from, to, subject, html, text })
      // eslint-disable-next-line no-console
      console.log('[reminders] test email result', result)
      return res.json({ ok: true, id: result?.id })
    }

    return res.status(400).json({ ok: false, error: 'Provide { sample: true, to: email } to test for now.' })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reminders] error', err)
    return res.status(500).json({ ok: false, error: String(err?.message || err) })
  }
})

export default router


