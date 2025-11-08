import fetch from 'node-fetch'
global.fetch = fetch
import dotenv from 'dotenv'
dotenv.config({ path: process.env.ENV_PATH || '.env.local' })

import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getReminderEmailHtml } from './emailTemplates.js'
import multer from 'multer'
import OpenAI from 'openai'
import * as pdfjsLib from 'pdfjs-dist'
// import medicationRemindersRouter from './routes/medication-reminders.js'
import deadlineNotifications from './routes/deadline-notifications.js'
import schedule from 'node-schedule'
import { sendSMS } from './utils/sendSMS.js'

// Validate required env vars
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error('[server] Missing env vars:', missing.join(', '))
}

// Initialize Supabase with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY)

// Initialize OpenAI (server-side)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000 })

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Routes (medication reminders router not ready yet)
// app.use('/api/medication-reminders', medicationRemindersRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
  })
})

// Dynamic import AFTER dotenv is configured
const startServer = async () => {
 
  // File upload (memory storage)
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

  // PDF/Image extraction via OpenAI Vision (server-side)
  app.post('/api/extract-pdf', upload.single('file'), async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY not configured' })
      }
      const file = req.file
      if (!file) {
        return res.status(400).json({ ok: false, error: 'No file provided. Use multipart/form-data with field name "file".' })
      }
      // eslint-disable-next-line no-console
      console.log('[extract-pdf] upload info', { mimetype: file.mimetype, size: file.buffer?.length })
      const mime = file.mimetype || 'application/octet-stream'
      const base64 = file.buffer.toString('base64')
      const dataUrl = `data:${mime};base64,${base64}`

      const prompt = `Extract ALL fields from this veterinary invoice and return as JSON:\n{
  "clinic_name": "full clinic name",
  "clinic_address": "complete address with city, state, zip",
  "pet_name": "pet's name",
  "service_date": "YYYY-MM-DD format",
  "total_amount": numeric value,
  "invoice_number": "invoice number if visible",
  "diagnosis": "reason for visit or diagnosis",
  "line_items": [{"description": "service name", "amount": numeric value}]
}\n\nExtract EVERY visible field from the image. If a field is not visible, use null. Return ONLY valid JSON.`

      let completion
      if (mime === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        // Extract text from PDF using pdfjs-dist and send as plain text
        // eslint-disable-next-line no-console
        console.log('[extract-pdf] starting pdfjs text extraction')
        let pdfText = ''
        try {
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(file.buffer) }).promise
          const pieces = []
          // Extract ALL pages for complete accuracy - financial app cannot miss any data (5-7 seconds is acceptable for accuracy)
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const content = await page.getTextContent()
            const pageText = (content.items || []).map((it) => (it.str || '')).join(' ')
            pieces.push(pageText)
          }
          pdfText = pieces.join('\n\n')
          // eslint-disable-next-line no-console
          console.log('[extract-pdf] pdfjs extraction success', { pages: (await pdf.numPages), textLength: pdfText.length })
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[extract-pdf] pdfjs extraction error', e)
          throw e
        }
        completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: `${prompt}\n\nPDF_TEXT:\n${pdfText}` }],
            },
          ],
          temperature: 0,
          max_tokens: 2000,
        })
      } else {
        // Image path (send as image_url)
        completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 2000,
        })
      }

      const content = completion.choices?.[0]?.message?.content ?? ''
      let parsed = null
      try {
        let cleaned = content.trim()
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```json\s*/i, '')
          cleaned = cleaned.replace(/^```\s*/i, '')
          cleaned = cleaned.replace(/\s*```\s*$/, '')
        }
        parsed = JSON.parse(cleaned)
      } catch {
        const match = content.match(/\{[\s\S]*\}/)
        if (match) {
          try { parsed = JSON.parse(match[0]) } catch {}
        }
      }
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.error('[extract-pdf] could not parse JSON from model response:', content)
        return res.status(422).json({ ok: false, error: 'Could not parse JSON from AI response', raw: content })
      }
      return res.json({ ok: true, data: parsed })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[extract-pdf] error', err)
      return res.status(500).json({ ok: false, error: String(err?.message || err) })
    }
  })


  // Send reminder emails for expiring claims
  app.post('/api/send-reminders', async (req, res) => {
    try {
      console.log('Checking for expiring claims...')
      
      const today = new Date()
      const fifteenDaysFromNow = new Date()
      fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15)
      
      // Fetch all not-filed claims and calculate deadline in JavaScript
      // Basic diagnostics
      // eslint-disable-next-line no-console
      console.log('[server] About to query Supabase (url present:', Boolean(process.env.SUPABASE_URL), 'service key present:', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), ')')

const { data: allClaims, error } = await supabase
  .from('claims')
  .select('*, pets(id, name)')
  .eq('filing_status', 'not_filed')

// eslint-disable-next-line no-console
console.log('[server] Query completed. Claims found:', allClaims?.length, 'error:', error ? String(error?.message || error) : null)

if (error) {
  console.error('Supabase error details:', JSON.stringify(error, null, 2))
  throw error
}
      // Filter claims that expire within 15 days
      const expiringClaims = allClaims.filter(claim => {
        const serviceDate = new Date(claim.service_date)
        const deadline = new Date(serviceDate)
        deadline.setDate(serviceDate.getDate() + claim.filing_deadline_days)
        
        return deadline <= fifteenDaysFromNow && deadline >= today
      })
      
      if (!expiringClaims || expiringClaims.length === 0) {
        console.log('No expiring claims found')
        return res.json({ 
          success: true,
          message: 'No expiring claims found', 
          emailsSent: 0,
          totalExpiringClaims: 0
        })
      }
      
      console.log(`Found ${expiringClaims.length} expiring claims`)
      
      // Group claims by user
      const claimsByUser = {}
      for (const claim of expiringClaims) {
        if (!claimsByUser[claim.user_id]) {
          claimsByUser[claim.user_id] = []
        }
        
        const serviceDate = new Date(claim.service_date)
        const deadline = new Date(serviceDate)
        deadline.setDate(serviceDate.getDate() + claim.filing_deadline_days)
        
        const petName = (claim && claim.pets && claim.pets.name) ? claim.pets.name : 'Your pet'
        claimsByUser[claim.user_id].push({
          petName,
          serviceDate: claim.service_date,
          amount: claim.total_amount,
          deadline: deadline.toISOString().split('T')[0],
          filingStatus: claim.filing_status
        })
      }
      
      // Send email to each user
      let emailsSent = 0
      for (const [userId, claims] of Object.entries(claimsByUser)) {
        // Get user email from auth.users
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
        
        if (userError || !userData.user.email) {
          console.error(`Could not find email for user ${userId}`)
          continue
        }
        
        const userEmail = userData.user.email
        const userName = userEmail.split('@')[0]
        
        // Send email
        const emailHtml = getReminderEmailHtml(userName, claims)
        
        const { data, error: emailError } = await resend.emails.send({
          from: process.env.MAIL_FROM || 'Pet Claim Helper <onboarding@resend.dev>',
          to: [userEmail],
          subject: `⚠️ ${claims.length} Pet Claim${claims.length > 1 ? 's' : ''} Expiring Soon!`,
          html: emailHtml
        })
        
        if (emailError) {
          console.error(`Failed to send email to ${userEmail}:`, emailError)
        } else {
          console.log(`✅ Sent reminder to ${userEmail}`)
          emailsSent++
        }
      }
      
      res.json({ 
        success: true,
        message: `Successfully sent ${emailsSent} reminder emails`,
        emailsSent: emailsSent,
        totalExpiringClaims: expiringClaims.length
      })
      
    } catch (error) {
      console.error('Error sending reminders:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  })

  // Test email endpoint (Resend)
  app.options('/api/test-email', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    return res.sendStatus(204)
  })
  app.post('/api/test-email', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    try {
      const from = 'Pet Claim Helper <onboarding@resend.dev>'
      const to = ['larry@vrexistence.com']
      const subject = 'Pet Claim Helper - Test Email'
      const text = "If you're seeing this, Resend is working on Vercel!"

      const key = process.env.RESEND_API_KEY || ''
      const keyPreview = key ? `${key.slice(0, 10)}...${key.slice(-10)}` : 'MISSING'
      console.log('[test-email] Key present:', key ? keyPreview : 'NO KEY')
      console.log('[test-email] Sending to:', to.join(','), 'subject:', subject, 'from:', from)

      const result = await resend.emails.send({ from, to, subject, text })
      console.log('[test-email] Resend response:', result)
      return res.json({ ok: true, messageId: result?.id })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[/api/test-email] error', err)
      return res.status(500).json({ ok: false, error: String(err?.message || err) })
    }
  })

  // Daily deadline reminders endpoint (used by cron)
  app.options('/api/send-deadline-reminders', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    return res.sendStatus(204)
  })
  app.post('/api/send-deadline-reminders', async (req, res) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] send-deadline-reminders endpoint hit')
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    try {
      const result = await deadlineNotifications.runDeadlineNotifications({
        // Reuse initialized clients to avoid re-auth
        supabase,
        resend,
      })
      return res.json({ ok: true, ...result })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[/api/send-deadline-reminders] error', err)
      return res.status(500).json({ ok: false, error: String(err?.message || err) })
    }
  })
  // eslint-disable-next-line no-console
  console.log('Deadline reminders route registered')
  
  // Shared function to send medication reminders without HTTP round-trip
  const sendMedicationReminders = async () => {
    console.log('[Medication Reminders] start at', new Date().toISOString())
    const { data: meds, error: medsError } = await supabase
      .from('medications')
      .select('id, user_id, pet_id, medication_name, dosage, frequency, reminder_times, start_date, end_date, next_reminder_time, pets(name)')
    if (medsError) {
      console.error('[Medication Reminders] query error:', medsError)
      throw new Error(medsError.message)
    }
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nowHour = now.getHours()
    const nowMinute = now.getMinutes()
    const parseTimes = (val) => {
      if (!val) return []
      try {
        if (Array.isArray(val)) return val
        if (typeof val === 'string') return JSON.parse(val)
      } catch {}
      return []
    }
    const dueMeds = (meds || []).filter((m) => {
      if (m?.end_date) {
        const end = new Date(m.end_date)
        if (!Number.isNaN(end.getTime()) && end < startOfToday) return false
      }
      const times = parseTimes(m?.reminder_times)
      if (!times.length) return false
      const matches = times.find((t) => {
        const [hh, mm] = String(t).split(':').map((x) => Number(x))
        if (!Number.isFinite(hh)) return false
        if (Number.isFinite(mm)) return hh === nowHour && mm === nowMinute
        return hh === nowHour
      })
      if (!matches) return false
      if (m?.next_reminder_time) {
        const nxt = new Date(m.next_reminder_time)
        if (!Number.isNaN(nxt.getTime()) && nxt > now) return false
      }
      return true
    })
    let remindersSent = 0
    const results = []
    const computeNextReminderSameTimeTomorrow = (matchedTimeString) => {
      const [hh, mm] = String(matchedTimeString || `${nowHour}:${nowMinute.toString().padStart(2, '0')}`).split(':').map((x) => Number(x))
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Number.isFinite(hh) ? hh : nowHour, Number.isFinite(mm) ? mm : 0, 0, 0)
      return d
    }
    for (const med of dueMeds) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', med.user_id)
          .single()
        const phone = prof?.phone_number || null
        if (!phone) {
          console.log('[Medication Reminders] No phone on file; skipping', { medId: med.id, userId: med.user_id })
          results.push({ medId: med.id, sent: false, reason: 'no_phone' })
          continue
        }
        const petName = med?.pets?.name || 'your pet'
        const medName = med?.medication_name || 'medication'
        const dosage = med?.dosage ? ` - ${med.dosage}` : ''
        const message = `🐾 Medication reminder for ${petName}: ${medName}${dosage}. Time to give medication!`
        const smsRes = await sendSMS(phone, message)
        console.log('[Medication Reminders] SMS result:', { medId: med.id, phone, success: smsRes.success, messageId: smsRes.messageId })
        if (smsRes.success) {
          remindersSent += 1
          const times = parseTimes(med?.reminder_times)
          const matched = times.find((t) => {
            const [hh, mm] = String(t).split(':').map((x) => Number(x))
            if (!Number.isFinite(hh)) return false
            if (Number.isFinite(mm)) return hh === nowHour && mm === nowMinute
            return hh === nowHour
          }) || `${nowHour}:${nowMinute.toString().padStart(2, '0')}`
          const nextAt = computeNextReminderSameTimeTomorrow(matched)
          await supabase
            .from('medications')
            .update({ next_reminder_time: nextAt.toISOString() })
            .eq('id', med.id)
          results.push({ medId: med.id, sent: true, messageId: smsRes.messageId, nextReminder: nextAt.toISOString() })
        } else {
          results.push({ medId: med.id, sent: false, reason: 'sms_failed', error: smsRes.error })
        }
      } catch (perErr) {
        console.error('[Medication Reminders] error for med', med?.id, perErr)
        results.push({ medId: med?.id, sent: false, reason: 'exception', error: perErr?.message || String(perErr) })
      }
    }
    return { success: true, remindersSent, totalEligible: dueMeds.length, results }
  }

  // SMS medication reminders endpoint
  app.options('/api/send-medication-reminders', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    return res.sendStatus(204)
  })
  app.post('/api/send-medication-reminders', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    try {
      const result = await sendMedicationReminders()
      return res.json(result)
    } catch (err) {
      console.error('[/api/send-medication-reminders] error', err)
      return res.status(500).json({ success: false, error: String(err?.message || err) })
    }
  })

  const port = process.env.PORT || 8787
  // Cron: medication reminders every minute
  try {
    schedule.scheduleJob('* * * * *', async () => {
      // eslint-disable-next-line no-console
      console.log('[Cron] Medication reminders check at', new Date())
      try {
        const result = await sendMedicationReminders()
        console.log('[Cron] Medication reminders result:', { remindersSent: result.remindersSent, totalEligible: result.totalEligible })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cron] Medication reminders failed:', error?.message || error)
      }
    })
  } catch (cronErr) {
    // eslint-disable-next-line no-console
    console.error('[Cron] schedule init failed:', cronErr)
  }
  // ADD THIS ENDPOINT TO YOUR server/index.js
// This relay endpoint receives form submissions and forwards them to GHL
// Solves CORS issues by doing the request server-to-server instead of browser-to-GHL

app.post('/api/webhook/ghl-signup', async (req, res) => {
  try {
      const { email } = req.body;

      // Validate email
      if (!email || !email.includes('@')) {
          return res.status(400).json({ 
              error: 'Invalid email address' 
          });
      }

      // Forward to GHL webhook
      const ghlResponse = await fetch(
          'https://services.leadconnectorhq.com/hooks/QxgfcOXRCyVUmy40Z5Nm/webhook-trigger/c21087d8-163b-4faa-be61-4be8',
          {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  email: email, 
                  tags: ['Pet Claim Helper Waitlist'] 
              })
          }
      );

      // Check if GHL responded successfully
      if (!ghlResponse.ok) {
          console.error('GHL webhook error:', ghlResponse.status);
          return res.status(500).json({ 
              error: 'Failed to process signup' 
          });
      }

      // Success!
      res.json({ 
          success: true, 
          message: 'Signup received! Check your email.' 
      });

  } catch (error) {
      console.error('Webhook relay error:', error);
      res.status(500).json({ 
          error: 'Server error processing signup' 
      });
  }
});
  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`)
  })
}

startServer()