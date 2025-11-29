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
import { runMedicationReminders } from './routes/medication-reminders.js'
import deadlineNotifications from './routes/deadline-notifications.js'
import schedule from 'node-schedule'
import { sendSMS } from './utils/sendSMS.js'
import { DateTime } from 'luxon'
import { PDFDocument } from 'pdf-lib'
import { generateClaimFormPDF, validateClaimData } from './lib/generateClaimPDF.js'
import { sendClaimEmail } from './lib/sendClaimEmail.js'
import { getMissingRequiredFields } from './lib/claimFormMappings.js'
import { formatPhoneToE164 } from './utils/phoneUtils.js'

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
  "clinic_phone": "veterinary clinic phone number in format (XXX) XXX-XXXX or XXX-XXX-XXXX",
  "pet_name": "pet's name",
  "service_date": "YYYY-MM-DD format",
  "total_amount": numeric value,
  "invoice_number": "invoice number if visible",
  "diagnosis": "reason for visit or diagnosis",
  "line_items": [{"description": "service name", "amount": numeric value}]
}\n\nIMPORTANT INSTRUCTIONS:
- The clinic_phone is CRITICAL - look carefully in the invoice header/top section for phone numbers
- Common formats: (949) 936-0066, 949-936-0066, (949)936-0066
- The clinic phone is usually displayed near the clinic name and address at the top of the invoice
- Extract the COMPLETE phone number including area code
- If you see multiple phone numbers, extract the main clinic phone (usually the first/largest one)
- If a field is not visible, use null
- Return ONLY valid JSON with no additional text or explanations.`

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

      // 🔥 CRITICAL DEBUG LOGGING - CHECK WHAT OPENAI ACTUALLY RETURNED
      console.log('='.repeat(80))
      console.log('[extract-pdf] ✅ OPENAI VISION EXTRACTION RESULT')
      console.log('='.repeat(80))
      console.log('Raw OpenAI response:', content)
      console.log('-'.repeat(80))
      console.log('Parsed JSON:', JSON.stringify(parsed, null, 2))
      console.log('-'.repeat(80))
      console.log('🔍 CRITICAL FIELD CHECK:')
      console.log('  clinic_name:', parsed.clinic_name || '(NULL)')
      console.log('  clinic_address:', parsed.clinic_address || '(NULL)')
      console.log('  clinic_phone:', parsed.clinic_phone || '❌ NULL/MISSING')
      console.log('  pet_name:', parsed.pet_name || '(NULL)')
      console.log('  service_date:', parsed.service_date || '(NULL)')
      console.log('  total_amount:', parsed.total_amount || '(NULL)')
      console.log('='.repeat(80))

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
      // AUTHENTICATION: Server-only endpoint (for cron jobs/admin)
      const authHeader = req.headers.authorization
      if (!process.env.SERVER_SECRET) {
        console.error('[Send Reminders] SERVER_SECRET not configured')
        return res.status(500).json({ ok: false, error: 'Server misconfigured' })
      }
      if (authHeader !== `Bearer ${process.env.SERVER_SECRET}`) {
        console.error('[Send Reminders] Unauthorized access attempt')
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }

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
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    try {
      // AUTHENTICATION: Server-only endpoint (for testing/admin)
      const authHeader = req.headers.authorization
      if (!process.env.SERVER_SECRET) {
        console.error('[Test Email] SERVER_SECRET not configured')
        return res.status(500).json({ ok: false, error: 'Server misconfigured' })
      }
      if (authHeader !== `Bearer ${process.env.SERVER_SECRET}`) {
        console.error('[Test Email] Unauthorized access attempt')
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }

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
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.sendStatus(204)
  })
  app.post('/api/send-deadline-reminders', async (req, res) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] send-deadline-reminders endpoint hit')

    // PRIORITY 3: Protect manual endpoint with authentication
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      // eslint-disable-next-line no-console
      console.error('[/api/send-deadline-reminders] Unauthorized access attempt')
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
  
  // OLD FUNCTION - DEPRECATED (used UTC time instead of PST)
  // This has been replaced by runMedicationReminders() from ./routes/medication-reminders.js
  // which correctly uses PST timezone via Luxon
  /*
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
          .select('phone')
          .eq('id', med.user_id)
          .single()
        const phone = prof?.phone || null
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
  */

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
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    try {
      // AUTHENTICATION: Server-only endpoint (deprecated - use cron job)
      const authHeader = req.headers.authorization
      if (!process.env.SERVER_SECRET) {
        console.error('[Send Medication Reminders] SERVER_SECRET not configured')
        return res.status(500).json({ success: false, error: 'Server misconfigured' })
      }
      if (authHeader !== `Bearer ${process.env.SERVER_SECRET}`) {
        console.error('[Send Medication Reminders] Unauthorized access attempt')
        return res.status(401).json({ success: false, error: 'Unauthorized' })
      }

      const result = await sendMedicationReminders()
      return res.json(result)
    } catch (err) {
      console.error('[/api/send-medication-reminders] error', err)
      return res.status(500).json({ success: false, error: String(err?.message || err) })
    }
  })

  const port = process.env.PORT || 8787
  // Cron: medication reminders every minute (using PST timezone)
  try {
    schedule.scheduleJob('* * * * *', async () => {
      // eslint-disable-next-line no-console
      console.log('[Cron] Medication reminders check at', new Date())
      try {
        const result = await runMedicationReminders({ supabase })
        console.log('[Cron] Medication reminders result:', { sent: result.sent, skipped: result.skipped })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cron] Medication reminders failed:', error?.message || error)
      }
    })
  } catch (cronErr) {
    // eslint-disable-next-line no-console
    console.error('[Cron] schedule init failed:', cronErr)
  }

  // Cron: deadline reminders daily at 9 AM Pacific Time (5 PM UTC / 17:00 UTC)
  try {
    schedule.scheduleJob('0 17 * * *', async () => {
      // eslint-disable-next-line no-console
      console.log('[Cron] Deadline reminders check at', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }), 'Pacific')
      try {
        const result = await deadlineNotifications.runDeadlineNotifications({
          supabase,
          resend,
        })
        // eslint-disable-next-line no-console
        console.log('[Cron] Deadline reminders result:', result)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cron] Deadline reminders failed:', error?.message || error)
      }
    })
    // eslint-disable-next-line no-console
    console.log('[Cron] Deadline reminders scheduled for 9 AM Pacific Time daily (0 17 * * * UTC = 9 AM PST/PDT)')
  } catch (cronErr) {
    // eslint-disable-next-line no-console
    console.error('[Cron] Deadline reminders schedule init failed:', cronErr)
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

  // SMS Webhook Handler - Twilio sends POST requests here
  // Handles HELP and STOP commands
  app.post('/api/sms/incoming', express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const { Body, From } = req.body
      const messageBody = (Body || '').trim().toUpperCase()
      const phoneNumber = From

      console.log('[SMS Webhook] Incoming message:', { from: phoneNumber, body: messageBody })

      // Handle HELP command
      if (messageBody.includes('HELP')) {
        const helpMessage = 'Pet Claim Helper here! 🐾 We send medication reminders to help you care for your pet. Reply STOP to opt-out. Questions? larry@uglydogadventures.com'
        res.type('text/xml')
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${helpMessage}</Message>
</Response>`)
      }

      // Handle STOP command - update database
      if (messageBody.includes('STOP')) {
        // Twilio automatically handles the STOP response
        // We just need to update our database
        const { error } = await supabase
          .from('profiles')
          .update({ sms_opt_in: false })
          .eq('phone', phoneNumber)

        if (error) {
          console.error('[SMS Webhook] Error updating opt-out:', error)
        } else {
          console.log('[SMS Webhook] User opted out:', phoneNumber)
        }

        // Twilio will send the automatic STOP response
        // We just need to acknowledge with empty TwiML
        res.type('text/xml')
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`)
      }

      // Default response for other messages
      res.type('text/xml')
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`)
    } catch (error) {
      console.error('[SMS Webhook] Error:', error)
      res.type('text/xml')
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`)
    }
  })

  // Welcome SMS endpoint - called after user completes onboarding
  app.post('/api/sms/welcome', async (req, res) => {
    try {
      // AUTHENTICATION: Verify user session (user must be logged in to send welcome SMS)
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('[SMS Welcome] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - no valid session' })
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[SMS Welcome] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Unauthorized - invalid token' })
      }

      const { userId, phoneNumber } = req.body

      // AUTHORIZATION: Verify the authenticated user matches the userId
      if (userId && user.id !== userId) {
        console.error('[SMS Welcome] User mismatch:', { authenticated: user.id, requested: userId })
        return res.status(403).json({ ok: false, error: 'Forbidden - user mismatch' })
      }

      if (!phoneNumber) {
        return res.status(400).json({ ok: false, error: 'Phone number required' })
      }

      // Import Twilio SMS utility
      const { sendTwilioSMS } = await import('./utils/sendTwilioSMS.js')

      const message = "Welcome to Pet Claim Helper! 🐾 We'll send friendly reminders for your pet's medications. You've got this! Reply HELP or STOP to opt-out."
      const result = await sendTwilioSMS(phoneNumber, message)

      if (result.success) {
        console.log('[Welcome SMS] Sent to:', phoneNumber, 'MessageID:', result.messageId)
        return res.json({ ok: true, messageId: result.messageId })
      } else {
        console.error('[Welcome SMS] Failed:', result.error)
        return res.status(500).json({ ok: false, error: result.error })
      }
    } catch (error) {
      console.error('[Welcome SMS] Error:', error)
      return res.status(500).json({ ok: false, error: error.message })
    }
  })

  // Mark medication dose as given
  // Supports two auth methods:
  // 1. Magic link token (from SMS) - works without login
  // 2. Traditional userId session auth
  app.post('/api/medications/:id/mark-given', async (req, res) => {
    try {
      const { id: medicationId } = req.params
      const { userId, token } = req.body
      const nowPST = DateTime.now().setZone('America/Los_Angeles')

      // METHOD 1: Magic Link Token Authentication (passwordless)
      if (token) {
        console.log('[Mark Given] Magic link auth attempt:', { medicationId, token: token.slice(0, 8) + '...' })

        // Find dose by token
        const { data: dose, error: doseError } = await supabase
          .from('medication_doses')
          .select('*')
          .eq('medication_id', medicationId)
          .eq('one_time_token', token)
          .eq('status', 'pending')
          .single()

        if (doseError || !dose) {
          console.error('[Mark Given] Invalid or expired token:', doseError?.message)
          return res.status(401).json({ ok: false, error: 'Invalid or expired link. Please check your recent SMS.' })
        }

        // Check token expiration
        const expiresAt = DateTime.fromISO(dose.token_expires_at)
        if (nowPST > expiresAt) {
          console.error('[Mark Given] Token expired:', { expiresAt: expiresAt.toISO(), now: nowPST.toISO() })
          return res.status(401).json({ ok: false, error: 'This link has expired. Please check for a newer SMS.' })
        }

        // Mark dose as given and DELETE token (single use)
        const { error: updateError } = await supabase
          .from('medication_doses')
          .update({
            status: 'given',
            given_time: nowPST.toISO(),
            one_time_token: null, // Delete token after use
            token_expires_at: null
          })
          .eq('id', dose.id)

        if (updateError) {
          console.error('[Mark Given] Error updating dose:', updateError)
          return res.status(500).json({ ok: false, error: 'Error marking dose as given' })
        }

        console.log('[Mark Given] ✅ Dose marked via magic link:', {
          doseId: dose.id,
          medicationId,
          givenTime: nowPST.toISO()
        })

        return res.json({ ok: true, message: 'Medication marked as given' })
      }

      // METHOD 2: Traditional Session Authentication (requires userId)
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'User ID or token required' })
      }

      console.log('[Mark Given] Session auth attempt:', { medicationId, userId })

      // Get the medication to verify ownership
      const { data: medication, error: medError } = await supabase
        .from('medications')
        .select('*')
        .eq('id', medicationId)
        .eq('user_id', userId)
        .single()

      if (medError || !medication) {
        return res.status(404).json({ ok: false, error: 'Medication not found' })
      }

      // Find today's pending dose for this medication (using PST timezone)
      const todayPST = nowPST.toISODate()

      console.log('[Mark Given] Finding dose:', {
        medicationId,
        userId,
        todayPST
      })

      const { data: doses, error: doseError } = await supabase
        .from('medication_doses')
        .select('*')
        .eq('medication_id', medicationId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('scheduled_time', `${todayPST}T00:00:00`)
        .lt('scheduled_time', `${todayPST}T23:59:59`)
        .order('scheduled_time', { ascending: true })
        .limit(1)

      if (doseError) {
        console.error('[Mark Given] Error finding dose:', doseError)
        return res.status(500).json({ ok: false, error: 'Error finding dose' })
      }

      if (!doses || doses.length === 0) {
        console.error('[Mark Given] No pending dose found for today')
        return res.status(404).json({ ok: false, error: 'No pending dose found for today' })
      }

      // Mark the dose as given
      const dose = doses[0]
      const { error: updateError } = await supabase
        .from('medication_doses')
        .update({
          status: 'given',
          given_time: nowPST.toISO()
        })
        .eq('id', dose.id)

      if (updateError) {
        console.error('[Mark Given] Error updating dose:', updateError)
        return res.status(500).json({ ok: false, error: 'Error marking dose as given' })
      }

      console.log('[Mark Given] ✅ Dose marked via session:', {
        doseId: dose.id,
        medicationId,
        givenTime: nowPST.toISO()
      })

      console.log('[Mark Given] Dose marked as given:', dose.id)
      return res.json({ ok: true, doseId: dose.id })
    } catch (error) {
      console.error('[Mark Given] Error:', error)
      return res.status(500).json({ ok: false, error: error.message })
    }
  })

  // Check for missing required fields before claim submission
  app.post('/api/claims/validate-fields', async (req, res) => {
    try {
      // AUTHENTICATION: Verify user session
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('[Validate Fields] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - no valid session' })
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[Validate Fields] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Unauthorized - invalid token' })
      }

      const { claimId, userId, insurer } = req.body

      if (!claimId || !userId || !insurer) {
        return res.status(400).json({
          ok: false,
          error: 'claimId, userId, and insurer required'
        })
      }

      // AUTHORIZATION: Verify the authenticated user matches the userId in the request
      if (user.id !== userId) {
        console.error('[Validate Fields] User mismatch:', { authenticated: user.id, requested: userId })
        return res.status(403).json({ ok: false, error: 'Forbidden - user mismatch' })
      }

      console.log('[Validate Fields] Checking required fields:', { claimId, userId, insurer })

      // 1. Get claim data from claims table
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select('*')
        .eq('id', claimId)
        .eq('user_id', userId)
        .single()

      if (claimError || !claim) {
        console.error('[Validate Fields] Claim not found:', claimError)
        return res.status(404).json({ ok: false, error: `Claim not found: ${claimError?.message || 'Unknown error'}` })
      }

      console.log('[Validate Fields] Found claim:', { id: claim.id, pet_id: claim.pet_id })

      // 2. Get pet data
      const { data: pet, error: petError } = await supabase
        .from('pets')
        .select('*')
        .eq('id', claim.pet_id)
        .single()

      if (petError || !pet) {
        console.error('[Validate Fields] Pet not found:', petError)
        return res.status(404).json({ ok: false, error: `Pet not found: ${petError?.message || 'Unknown error'}` })
      }

      console.log('[Validate Fields] Found pet:', { id: pet.id, name: pet.name, insurance_company: pet.insurance_company })

      // 3. Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError || !profile) {
        console.error('[Validate Fields] Profile not found:', profileError)
        return res.status(404).json({ ok: false, error: `Profile not found: ${profileError?.message || 'Unknown error'}` })
      }

      console.log('[Validate Fields] Found profile:', { id: profile.id, has_signature: !!profile.signature, has_address: !!profile.address })

      // 4. Check for missing required fields
      const missingFields = getMissingRequiredFields(
        insurer,
        profile,
        pet,
        claim
      )

      // 5. AI extraction for fields with aiExtract flag
      for (const fieldDef of missingFields) {
        if (fieldDef.aiExtract && fieldDef.aiPrompt) {
          try {
            // Extract data using AI (e.g., body part from diagnosis)
            const extractedValue = await extractFieldWithAI(
              fieldDef,
              { profile, pet, claim }
            )

            if (extractedValue) {
              // Add the extracted value to the field definition
              fieldDef.suggestedValue = extractedValue
            }
          } catch (err) {
            console.error('[Validate Fields] AI extraction failed:', err)
            // Continue without suggested value
          }
        }
      }

      return res.json({
        ok: true,
        missingFields,
        allFieldsPresent: missingFields.length === 0,
        petName: pet.name  // For dynamic prompt replacement in MissingFieldsModal
      })

    } catch (error) {
      console.error('[Validate Fields] Error:', error)
      return res.status(500).json({ ok: false, error: error.message })
    }
  })

  // Helper function to extract field values using AI
  async function extractFieldWithAI(fieldDef, data) {
    if (!process.env.OPENAI_API_KEY) {
      return null
    }

    const { claim } = data

    // Build context for AI
    let context = ''
    if (fieldDef.field === 'bodyPartAffected') {
      context = `Diagnosis: ${claim.diagnosis || claim.visit_title || 'Unknown'}`
    }

    if (!context) return null

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a medical data extraction assistant. ${fieldDef.aiPrompt}. Return ONLY the extracted value, nothing else. If you cannot extract the information with high confidence, return "UNABLE_TO_EXTRACT".`
          },
          {
            role: 'user',
            content: context
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      })

      const extracted = completion.choices[0]?.message?.content?.trim()

      if (extracted && extracted !== 'UNABLE_TO_EXTRACT') {
        return extracted
      }
    } catch (err) {
      console.error('[AI Extract] Error:', err)
    }

    return null
  }

  // Save collected fields from missing fields modal
  app.post('/api/claims/:claimId/save-collected-fields', async (req, res) => {
    try {
      // AUTHENTICATION: Verify user session
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('[Save Collected Fields] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - no valid session' })
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[Save Collected Fields] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Unauthorized - invalid token' })
      }

      const { claimId } = req.params
      const { collectedData } = req.body

      console.log('[Save Collected Fields] claimId:', claimId, 'data:', collectedData)

      // Get claim to find user_id and pet_id
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select('user_id, pet_id')
        .eq('id', claimId)
        .single()

      if (claimError || !claim) {
        console.error('[Save Collected Fields] Claim not found:', claimError)
        return res.status(404).json({ ok: false, error: 'Claim not found' })
      }

      // AUTHORIZATION: Verify the authenticated user owns this claim
      if (user.id !== claim.user_id) {
        console.error('[Save Collected Fields] User mismatch:', { authenticated: user.id, claimOwner: claim.user_id })
        return res.status(403).json({ ok: false, error: 'Forbidden - you do not own this claim' })
      }

      const userId = claim.user_id
      const petId = claim.pet_id

      console.log('[Save Collected Fields] userId:', userId, 'petId:', petId)

      // Save policyholder name to profiles table
      if (collectedData.policyholderName) {
        const { error: nameError } = await supabase
          .from('profiles')
          .update({ full_name: collectedData.policyholderName })
          .eq('id', userId)

        if (nameError) {
          console.error('[Save Collected Fields] Error saving policyholder name:', nameError)
        } else {
          console.log('[Save Collected Fields] Saved policyholder name:', collectedData.policyholderName)
        }
      }

      // Save signature to profiles table
      if (collectedData.signature) {
        const { error: sigError } = await supabase
          .from('profiles')
          .update({ signature: collectedData.signature })
          .eq('id', userId)

        if (sigError) {
          console.error('[Save Collected Fields] Error saving signature:', sigError)
        } else {
          console.log('[Save Collected Fields] Saved signature')
        }
      }

      // Save address to profiles table (handle both 'address' and 'policyholderAddress')
      const addressValue = collectedData.policyholderAddress || collectedData.address
      if (addressValue) {
        const { error: addrError } = await supabase
          .from('profiles')
          .update({ address: addressValue })
          .eq('id', userId)

        if (addrError) {
          console.error('[Save Collected Fields] Error saving address:', addrError)
        } else {
          console.log('[Save Collected Fields] Saved address:', addressValue)
        }
      }

      // Save phone to profiles table (format to E.164 before saving)
      if (collectedData.policyholderPhone) {
        const phoneE164 = formatPhoneToE164(collectedData.policyholderPhone)

        if (phoneE164) {
          const { error: phoneError } = await supabase
            .from('profiles')
            .update({ phone: phoneE164 })
            .eq('id', userId)

          if (phoneError) {
            console.error('[Save Collected Fields] Error saving phone:', phoneError)
          } else {
            console.log('[Save Collected Fields] Saved phone (E.164):', phoneE164, '(from input:', collectedData.policyholderPhone, ')')
          }
        } else {
          console.warn('[Save Collected Fields] Invalid phone number format, skipping:', collectedData.policyholderPhone)
        }
      }

      // Save adoption_date to pets table
      if (collectedData.adoptionDate) {
        const { error: adoptError } = await supabase
          .from('pets')
          .update({ adoption_date: collectedData.adoptionDate })
          .eq('id', petId)

        if (adoptError) {
          console.error('[Save Collected Fields] Error saving adoption date:', adoptError)
        } else {
          console.log('[Save Collected Fields] Saved adoption date')
        }
      }

      // Save date_of_birth to pets table
      if (collectedData.dateOfBirth) {
        const { error: dobError } = await supabase
          .from('pets')
          .update({ date_of_birth: collectedData.dateOfBirth })
          .eq('id', petId)

        if (dobError) {
          console.error('[Save Collected Fields] Error saving date of birth:', dobError)
        } else {
          console.log('[Save Collected Fields] Saved date of birth:', collectedData.dateOfBirth)
        }
      }

      // Save policy_number to pets table
      if (collectedData.policyNumber) {
        const { error: policyError } = await supabase
          .from('pets')
          .update({ policy_number: collectedData.policyNumber })
          .eq('id', petId)

        if (policyError) {
          console.error('[Save Collected Fields] Error saving policy number:', policyError)
        } else {
          console.log('[Save Collected Fields] Saved policy number:', collectedData.policyNumber)
        }
      }

      // Save healthy_paws_pet_id to pets table
      if (collectedData.healthyPawsPetId) {
        const { error: hpPetIdError } = await supabase
          .from('pets')
          .update({ healthy_paws_pet_id: collectedData.healthyPawsPetId })
          .eq('id', petId)

        if (hpPetIdError) {
          console.error('[Save Collected Fields] Error saving HP Pet ID:', hpPetIdError)
        } else {
          console.log('[Save Collected Fields] Saved HP Pet ID:', collectedData.healthyPawsPetId)
        }
      }

      // Save spay/neuter info to pets table
      if (collectedData.spayNeuterStatus) {
        const updateData = {
          spay_neuter_status: collectedData.spayNeuterStatus
        }

        // Only save date if status is "Yes"
        if (collectedData.spayNeuterStatus === 'Yes' && collectedData.spayNeuterDate) {
          updateData.spay_neuter_date = collectedData.spayNeuterDate
        }

        const { error: spayError } = await supabase
          .from('pets')
          .update(updateData)
          .eq('id', petId)

        if (spayError) {
          console.error('[Save Collected Fields] Error saving spay/neuter info:', spayError)
        } else {
          console.log('[Save Collected Fields] Saved spay/neuter info')
        }
      }

      // Save preferred_vet_name to pets table
      if (collectedData.treatingVet) {
        const { error: vetError } = await supabase
          .from('pets')
          .update({ preferred_vet_name: collectedData.treatingVet })
          .eq('id', petId)

        if (vetError) {
          console.error('[Save Collected Fields] Error saving vet name:', vetError)
        } else {
          console.log('[Save Collected Fields] Saved vet name')
        }
      }

      // ========== TRUPANION-SPECIFIC FIELDS ==========

      // Save other insurance history to pets table
      if (collectedData.hadOtherInsurance !== undefined) {
        const updateData = {
          had_other_insurance: collectedData.hadOtherInsurance === 'Yes'
        }

        // Only save provider and cancel date if had other insurance
        if (collectedData.hadOtherInsurance === 'Yes') {
          if (collectedData.otherInsuranceProvider) {
            updateData.other_insurance_provider = collectedData.otherInsuranceProvider
          }
          if (collectedData.otherInsuranceCancelDate) {
            updateData.other_insurance_cancel_date = collectedData.otherInsuranceCancelDate
          }
        }

        const { error: insuranceError } = await supabase
          .from('pets')
          .update(updateData)
          .eq('id', petId)

        if (insuranceError) {
          console.error('[Save Collected Fields] Error saving insurance history:', insuranceError)
        } else {
          console.log('[Save Collected Fields] Saved insurance history')
        }
      }

      // Save other hospitals visited to pets table
      if (collectedData.otherHospitalsVisited) {
        const { error: hospitalsError } = await supabase
          .from('pets')
          .update({ other_hospitals_visited: collectedData.otherHospitalsVisited })
          .eq('id', petId)

        if (hospitalsError) {
          console.error('[Save Collected Fields] Error saving hospital history:', hospitalsError)
        } else {
          console.log('[Save Collected Fields] Saved hospital history')
        }
      }

      // Note: These are claim-specific, don't save to database
      // They will be passed directly to PDF generation:
      // - bodyPartAffected (Nationwide)
      // - previousClaimSameCondition (Trupanion)
      // - previousClaimNumber (Trupanion)
      // - paymentMethod (Trupanion)

      res.json({
        ok: true,
        savedData: collectedData,
        message: 'Fields saved successfully'
      })

    } catch (error) {
      console.error('[Save Collected Fields] Error:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // Submit claim to insurance company
  app.post('/api/claims/submit', async (req, res) => {
    try {
      // AUTHENTICATION: Verify user session
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('[Submit Claim] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - no valid session' })
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[Submit Claim] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Unauthorized - invalid token' })
      }

      const { claimId, userId } = req.body

      if (!claimId || !userId) {
        return res.status(400).json({ ok: false, error: 'claimId and userId required' })
      }

      // AUTHORIZATION: Verify the authenticated user matches the userId in the request
      if (user.id !== userId) {
        console.error('[Submit Claim] User mismatch:', { authenticated: user.id, requested: userId })
        return res.status(403).json({ ok: false, error: 'Forbidden - user mismatch' })
      }

      console.log('[Submit Claim] Starting submission:', { claimId, userId })

      // 1. Get claim data from database
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select(`
          *,
          pets (
            name,
            species,
            breed,
            date_of_birth,
            policy_number,
            insurance_company,
            preferred_vet_name,
            adoption_date,
            spay_neuter_status,
            spay_neuter_date,
            healthy_paws_pet_id
          )
        `)
        .eq('id', claimId)
        .eq('user_id', userId)
        .single()

      if (claimError || !claim) {
        console.error('[Submit Claim] Claim not found:', claimError)
        return res.status(404).json({ ok: false, error: 'Claim not found' })
      }

      // 2. Get user profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError || !profile) {
        console.error('[Submit Claim] Profile not found:', profileError)
        return res.status(404).json({ ok: false, error: 'User profile not found' })
      }

      console.log('[Submit Claim] 📧 Profile email:', profile.email)

      // 3. Calculate pet age
      const petAge = claim.pets.date_of_birth
        ? Math.floor((new Date() - new Date(claim.pets.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null

      // 3.5. Extract body part from diagnosis (for Nationwide form)
      const extractBodyPart = (diagnosis) => {
        if (!diagnosis) return null

        const diagnosisLower = diagnosis.toLowerCase()

        // Common body parts to look for
        const bodyParts = {
          'ear': 'Ear',
          'eye': 'Eye',
          'leg': 'Leg',
          'paw': 'Paw',
          'skin': 'Skin',
          'stomach': 'Stomach',
          'abdomen': 'Abdomen',
          'dental': 'Teeth',
          'teeth': 'Teeth',
          'tooth': 'Teeth',
          'mouth': 'Mouth',
          'throat': 'Throat',
          'nose': 'Nose',
          'tail': 'Tail',
          'back': 'Back',
          'hip': 'Hip',
          'knee': 'Knee',
          'bladder': 'Bladder',
          'kidney': 'Kidney',
          'liver': 'Liver',
          'heart': 'Heart',
          'lung': 'Lung',
          'intestine': 'Intestine',
          'urinary': 'Urinary Tract',
          'anal': 'Anal Gland'
        }

        // Check for body part keywords
        for (const [keyword, bodyPart] of Object.entries(bodyParts)) {
          if (diagnosisLower.includes(keyword)) {
            return bodyPart
          }
        }

        return null
      }

      const diagnosis = claim.diagnosis || claim.ai_diagnosis || 'See attached invoice'
      const bodyPart = extractBodyPart(diagnosis)

      console.log('\n' + '='.repeat(80))
      console.log('🔍 DEBUG: CLAIM DATA EXTRACTION')
      console.log('='.repeat(80))
      console.log('claim.pets:', JSON.stringify(claim.pets, null, 2))
      console.log('claim.pets.policy_number:', claim.pets.policy_number)
      console.log('diagnosis:', diagnosis)
      console.log('bodyPart extracted:', bodyPart)
      console.log('profile.signature (first 50 chars):', profile.signature?.substring(0, 50))
      console.log('='.repeat(80) + '\n')

      // 4. Build claim data object for PDF/email
      const claimData = {
        policyholderName: profile.full_name || profile.email,
        policyholderAddress: profile.address || '',
        policyholderPhone: profile.phone || '',
        policyholderEmail: profile.email,
        policyNumber: claim.pets.policy_number || 'N/A',  // Get from pets table, not claims table
        healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
        petName: claim.pets.name,
        petSpecies: claim.pets.species,
        petBreed: claim.pets.breed || '',
        petAge: petAge,
        petDateOfBirth: claim.pets.date_of_birth, // For Trupanion form
        petAdoptionDate: claim.pets.adoption_date, // For Trupanion form
        petSpayNeuterStatus: claim.pets.spay_neuter_status, // For Trupanion form
        petSpayNeuterDate: claim.pets.spay_neuter_date, // For Trupanion form
        treatmentDate: claim.service_date || claim.created_at.split('T')[0],
        vetClinicName: claim.clinic_name || claim.pets.preferred_vet_name || 'Unknown Clinic',
        vetClinicAddress: claim.clinic_address || '',
        vetClinicPhone: claim.clinic_phone || '',
        diagnosis: diagnosis,
        bodyPartAffected: bodyPart,  // Extracted from diagnosis
        totalAmount: claim.total_amount || 0,
        itemizedCharges: claim.line_items || [],
        invoiceNumber: claim.invoice_number || '',  // Invoice/receipt number for HP and other insurers
        invoiceAttached: false, // For MVP, we're not attaching invoices yet

        // Trupanion: Payment method and other claim-specific fields
        paymentMethod: claim.payment_method || 'I have paid my bill in full',
        hadOtherInsurance: claim.had_other_insurance || 'No',
        previousClaimSameCondition: claim.previous_claim_same_condition || 'No'
      }

      console.log('\n' + '='.repeat(80))
      console.log('📦 DEBUG: CLAIM DATA OBJECT FOR PDF')
      console.log('='.repeat(80))
      console.log('policyNumber:', claimData.policyNumber)
      console.log('bodyPartAffected:', claimData.bodyPartAffected)
      console.log('diagnosis:', claimData.diagnosis)
      console.log('🔍 TRUPANION DATE FIELDS:')
      console.log('petDateOfBirth:', claimData.petDateOfBirth, '(from claim.pets.date_of_birth:', claim.pets.date_of_birth + ')')
      console.log('petAdoptionDate:', claimData.petAdoptionDate, '(from claim.pets.adoption_date:', claim.pets.adoption_date + ')')
      console.log('petSpayNeuterDate:', claimData.petSpayNeuterDate, '(from claim.pets.spay_neuter_date:', claim.pets.spay_neuter_date + ')')
      console.log('='.repeat(80) + '\n')

      // 5. Validate claim data
      try {
        validateClaimData(claimData)
      } catch (validationError) {
        console.error('[Submit Claim] Validation failed:', validationError.message)
        return res.status(400).json({ ok: false, error: `Invalid claim data: ${validationError.message}` })
      }

      // 6. Get insurer from pet's insurance company
      const rawInsurer = claim.pets?.insurance_company
      console.log('🏢 INSURER DETECTION - RAW VALUE')
      console.log('   claim.pets.insurance_company:', rawInsurer)
      console.log('   Type:', typeof rawInsurer)
      console.log('   Is null:', rawInsurer === null)
      console.log('   Is undefined:', rawInsurer === undefined)
      console.log('   Is empty string:', rawInsurer === '')

      const insurer = rawInsurer?.toLowerCase()
      if (!insurer) {
        const petName = claim.pets?.name || 'Unknown'
        console.error(`❌ Pet ${petName} has no insurance company set`)
        return res.status(400).json({
          ok: false,
          error: `Pet ${petName} has no insurance company set. Please update the pet's insurance company before submitting.`
        })
      }

      console.log('🏢 INSURER DETECTION - NORMALIZED')
      console.log('   insurer (normalized):', insurer)
      console.log('   Will generate PDF for:', insurer)

      // 7. Generate PDF
      const pdfBuffer = await generateClaimFormPDF(
        insurer,
        claimData,
        profile.signature || profile.full_name || profile.email.split('@')[0],
        new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      )

      console.log('[Submit Claim] PDF generated:', { size: pdfBuffer.length })

      // 7.5. Fetch invoice PDF from storage if it exists
      let invoiceBuffer = null
      if (claim.pdf_path) {
        try {
          console.log('[Submit Claim] Fetching invoice PDF from storage:', claim.pdf_path)
          const { data: invoiceData, error: storageError } = await supabase.storage
            .from('claim-pdfs')
            .download(claim.pdf_path)

          if (storageError) {
            console.error('[Submit Claim] Failed to fetch invoice PDF:', storageError)
            // Continue without invoice - don't fail submission
          } else if (invoiceData) {
            invoiceBuffer = Buffer.from(await invoiceData.arrayBuffer())
            console.log('[Submit Claim] Invoice PDF fetched:', { size: invoiceBuffer.length })
          }
        } catch (err) {
          console.error('[Submit Claim] Error fetching invoice:', err)
          // Continue without invoice - don't fail submission
        }
      } else {
        console.log('[Submit Claim] No invoice PDF path in claim record')
      }

      // 8. Send email to insurer (with both claim form and invoice)
      const emailResult = await sendClaimEmail(insurer, claimData, pdfBuffer, invoiceBuffer)

      if (!emailResult.success) {
        console.error('[Submit Claim] Email failed:', emailResult.error)
        return res.status(500).json({ ok: false, error: `Failed to send email: ${emailResult.error}` })
      }

      console.log('[Submit Claim] Email sent:', { messageId: emailResult.messageId })

      // 9. Update claim status in database
      const { error: updateError } = await supabase
        .from('claims')
        .update({
          filing_status: 'submitted',  // Frontend reads this field
          submitted_at: new Date().toISOString(),
          submission_email_id: emailResult.messageId
        })
        .eq('id', claimId)

      if (updateError) {
        console.error('[Submit Claim] Failed to update claim status:', updateError)
        // Don't fail the request - email was sent successfully
      } else {
        console.log('[Submit Claim] ✅ Claim status updated to "submitted"')
      }

      console.log('[Submit Claim] ✅ Claim submitted successfully:', {
        claimId,
        insurer,
        messageId: emailResult.messageId
      })

      return res.json({
        ok: true,
        message: 'Claim submitted successfully',
        messageId: emailResult.messageId,
        insurer
      })

    } catch (error) {
      console.error('[Submit Claim] Unexpected error:', error)
      return res.status(500).json({ ok: false, error: error.message })
    }
  })

  // Preview claim form PDF before submitting
  app.get('/api/claims/:claimId/preview-pdf', async (req, res) => {
    try {
      const { claimId } = req.params
      const authHeader = req.headers.authorization

      if (!authHeader) {
        return res.status(401).json({ ok: false, error: 'Missing authorization' })
      }

      const token = authHeader.replace('Bearer ', '')

      // Verify user auth token with Supabase
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !user) {
        console.error('[Preview PDF] Auth error:', authError)
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
      }

      console.log('[Preview PDF] Authenticated user:', user.id)

      // Fetch claim with pet info (same as submit endpoint)
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select(`
          *,
          pets (
            name,
            species,
            breed,
            date_of_birth,
            policy_number,
            insurance_company,
            preferred_vet_name,
            adoption_date,
            spay_neuter_status,
            spay_neuter_date,
            healthy_paws_pet_id
          )
        `)
        .eq('id', claimId)
        .eq('user_id', user.id)
        .single()

      if (claimError || !claim) {
        console.error('[Preview PDF] Claim not found:', claimError)
        return res.status(404).json({ ok: false, error: 'Claim not found' })
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        console.error('[Preview PDF] Profile not found:', profileError)
        return res.status(404).json({ ok: false, error: 'User profile not found' })
      }

      // Calculate pet age
      const petAge = claim.pets.date_of_birth
        ? Math.floor((new Date() - new Date(claim.pets.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null

      // Build claim data (same as submit)
      const claimData = {
        policyholderName: profile.full_name || user.email,
        policyholderAddress: profile.address || '',
        policyholderPhone: profile.phone || '',
        policyholderEmail: user.email,
        policyNumber: claim.pets.policy_number || 'N/A',
        healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
        petName: claim.pets.name,
        petSpecies: claim.pets.species,
        petBreed: claim.pets.breed || '',
        petAge: petAge,
        petDateOfBirth: claim.pets.date_of_birth, // For Trupanion form
        treatmentDate: claim.service_date || claim.created_at.split('T')[0],
        vetClinicName: claim.clinic_name || 'Unknown Clinic',
        vetClinicAddress: claim.clinic_address || '',
        vetClinicPhone: claim.clinic_phone || '',
        diagnosis: claim.diagnosis || claim.ai_diagnosis || 'See attached invoice',
        bodyPartAffected: '',  // TODO: Add body_part column to claims table for Nationwide
        totalAmount: claim.total_amount || 0,
        itemizedCharges: claim.line_items || [],
        invoiceNumber: claim.invoice_number || '',  // Invoice/receipt number for HP and other insurers
        invoiceAttached: false,

        // Trupanion-specific fields
        petAdoptionDate: claim.pets?.adoption_date,
        petSpayNeuterStatus: claim.pets?.spay_neuter_status,
        petSpayNeuterDate: claim.pets?.spay_neuter_date,
        hadOtherInsurance: claim.had_other_insurance || 'No',
        previousClaimSameCondition: claim.previous_claim_same_condition || 'No',
        paymentMethod: claim.payment_method || 'I have paid in full'
      }

      // Get insurer from pet's insurance company
      const rawInsurer = claim.pets?.insurance_company
      console.log('[Preview PDF] 🏢 INSURER DETECTION')
      console.log('   claim.pets.insurance_company:', rawInsurer)

      const insurer = rawInsurer?.toLowerCase()
      if (!insurer) {
        const petName = claim.pets?.name || 'Unknown'
        console.error(`❌ Pet ${petName} has no insurance company set`)
        return res.status(400).json({
          ok: false,
          error: `Pet ${petName} has no insurance company set. Please update the pet's insurance company.`
        })
      }

      console.log('   insurer (normalized):', insurer)
      console.log('   Will generate PDF for:', insurer)

      // Generate PDF
      console.log('[Preview PDF] Generating PDF for claim:', claimId)
      const pdfBuffer = await generateClaimFormPDF(
        insurer,
        claimData,
        profile.signature || profile.full_name || user.email.split('@')[0],
        new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      )

      console.log('[Preview PDF] PDF generated successfully:', pdfBuffer.length, 'bytes')

      // Check if we should merge with vet invoice
      const merged = req.query.merged === 'true'

      if (merged && claim.pdf_path) {
        console.log('[Preview PDF] Merging with vet invoice:', claim.pdf_path)

        try {
          // Download vet invoice from storage
          const { data: invoiceData, error: storageError } = await supabase.storage
            .from('claim-pdfs')
            .download(claim.pdf_path)

          if (storageError) {
            console.error('[Preview PDF] Could not fetch vet invoice:', storageError)
            // Fall back to claim form only
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', 'inline; filename="claim-preview.pdf"')
            return res.send(pdfBuffer)
          }

          // Merge PDFs using pdf-lib (imported at top of file)
          // Load both PDFs
          const claimFormPdf = await PDFDocument.load(pdfBuffer)
          console.log('[Preview PDF] Claim form loaded:', claimFormPdf.getPageCount(), 'pages')

          const invoiceBuffer = Buffer.from(await invoiceData.arrayBuffer())
          const invoicePdf = await PDFDocument.load(invoiceBuffer)
          console.log('[Preview PDF] Original vet invoice loaded:', invoicePdf.getPageCount(), 'pages')

          // Create new merged PDF
          const mergedPdf = await PDFDocument.create()

          // Copy all pages from claim form FIRST
          const claimPages = await mergedPdf.copyPages(claimFormPdf, claimFormPdf.getPageIndices())
          claimPages.forEach((page) => mergedPdf.addPage(page))
          console.log('[Preview PDF] Added', claimPages.length, 'pages from claim form')

          // Copy all pages from original vet invoice SECOND
          const invoicePages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices())
          invoicePages.forEach((page) => mergedPdf.addPage(page))
          console.log('[Preview PDF] Added', invoicePages.length, 'pages from original vet invoice')

          // Save merged PDF
          const mergedPdfBytes = await mergedPdf.save()

          console.log('[Preview PDF] ✅ Merged PDF created successfully!')
          console.log('[Preview PDF]    Total size:', mergedPdfBytes.length, 'bytes')
          console.log('[Preview PDF]    Total pages:', mergedPdf.getPageCount())
          console.log('[Preview PDF]    Structure: Claim form (pages 1-' + claimPages.length + ') + Original vet invoice (pages ' + (claimPages.length + 1) + '-' + mergedPdf.getPageCount() + ')')

          // Return merged PDF
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Disposition', 'inline; filename="claim-with-invoice.pdf"')
          return res.send(Buffer.from(mergedPdfBytes))

        } catch (mergeError) {
          console.error('[Preview PDF] Error merging PDFs:', mergeError)
          // Fall back to claim form only
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Disposition', 'inline; filename="claim-preview.pdf"')
          return res.send(pdfBuffer)
        }
      }

      // Return PDF for preview (inline, not download)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="claim-preview.pdf"')
      res.send(pdfBuffer)

    } catch (error) {
      console.error('[Preview PDF] Unexpected error:', error)
      return res.status(500).json({ ok: false, error: error.message })
    }
  })

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`)
  })
}

startServer()