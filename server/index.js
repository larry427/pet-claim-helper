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
import odieRoutes from './routes/odie.js'
import odieWebhookRoutes from './routes/odieWebhook.js'
import schedule from 'node-schedule'
import { sendSMS } from './utils/sendSMS.js'
import { DateTime } from 'luxon'
import { PDFDocument } from 'pdf-lib'
import { generateClaimFormPDF, validateClaimData } from './lib/generateClaimPDF.js'
import { sendClaimEmail } from './lib/sendClaimEmail.js'
import { getMissingRequiredFields, getRequiredFieldsForInsurer } from './lib/claimFormMappings.js'
import { formatPhoneToE164 } from './utils/phoneUtils.js'
import { Jimp } from 'jimp'
import rateLimit from 'express-rate-limit'

// Test Jimp availability at startup
try {
  console.log('[Startup] Jimp loaded:', typeof Jimp.read === 'function')
} catch (err) {
  console.error('[Startup] Jimp failed to load:', err)
}

// Helper function to detect image type from buffer magic bytes
function detectImageType(buffer) {
  if (!buffer || buffer.length < 4) return null

  // Check magic bytes (file signature)
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg'
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png'
  }

  // PDF: 25 50 44 46 (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return null // It's a PDF, not an image
  }

  // Unknown format
  return null
}

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
app.use(cors({
  origin: [
    'https://pet-claim-helper.vercel.app',
    'https://www.petclaimhelper.com',
    'http://localhost:5173',  // local development
    'http://localhost:5174'   // local development alternate port
  ],
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))

// Rate limiter for public signup endpoint (prevents spam attacks)
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 signups per IP per 15 minutes
  message: { ok: false, error: 'Too many signup attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
})

// Routes (medication reminders router not ready yet)
// app.use('/api/medication-reminders', medicationRemindersRouter)

// Odie Pet Insurance API routes
app.use('/api/odie', odieRoutes)
app.use('/api/odie', odieWebhookRoutes)  // Odie webhook receiver

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
      // AUTHENTICATION: Require valid user session to prevent API credit abuse
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[extract-pdf] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[extract-pdf] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
      }
      console.log('[extract-pdf] Authenticated user:', user.id)

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

      console.log('[extract-pdf] ✅ Extraction complete')

      return res.json({ ok: true, data: parsed })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[extract-pdf] error', err)
      return res.status(500).json({ ok: false, error: String(err?.message || err) })
    }
  })

  // Receipt extraction via OpenAI Vision (for Pet Expenses feature)
  app.post('/api/extract-receipt', upload.single('file'), async (req, res) => {
    try {
      // AUTHENTICATION: Require valid user session to prevent API credit abuse
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[extract-receipt] No authorization header')
        return res.status(401).json({ ok: false, error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        console.error('[extract-receipt] Invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
      }
      console.log('[extract-receipt] Authenticated user:', user.id)

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY not configured' })
      }
      const file = req.file
      if (!file) {
        return res.status(400).json({ ok: false, error: 'No file provided. Use multipart/form-data with field name "file".' })
      }
      console.log('[extract-receipt] upload info', { mimetype: file.mimetype, size: file.buffer?.length })

      const mime = file.mimetype || 'application/octet-stream'
      if (!mime.startsWith('image/')) {
        return res.status(400).json({ ok: false, error: 'Only image files are supported for receipt scanning.' })
      }

      const base64 = file.buffer.toString('base64')
      const dataUrl = `data:${mime};base64,${base64}`

      const prompt = `Extract information from this receipt and return as JSON:
{
  "vendor": "Store/merchant name",
  "total_amount": numeric total (the final amount paid),
  "date": "YYYY-MM-DD format if visible",
  "category_hint": "one of: food_treats, supplies_gear, grooming, training_boarding, other",
  "description": "Brief description of main items purchased"
}

For category_hint, use your best guess based on the items:
- food_treats: Pet food, treats, chews, dental sticks
- supplies_gear: Toys, beds, collars, leashes, crates, bowls, carriers
- grooming: Shampoo, brushes, nail clippers, grooming services
- training_boarding: Training classes, boarding, daycare, dog walking
- other: Anything else or mixed items

IMPORTANT:
- For total_amount, extract the FINAL total paid (after tax, discounts)
- If a field is not visible or cannot be determined, use null
- Return ONLY valid JSON with no additional text or explanations.`

      const completion = await openai.chat.completions.create({
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
        max_tokens: 1000,
      })

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
        console.error('[extract-receipt] could not parse JSON from model response:', content)
        return res.status(422).json({ ok: false, error: 'Could not parse JSON from AI response', raw: content })
      }

      console.log('[extract-receipt] ✅ Extraction complete')

      return res.json({ ok: true, data: parsed })
    } catch (err) {
      console.error('[extract-receipt] error', err)
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

      const result = await resend.emails.send({ from, to, subject, text })
      console.log('[test-email] ✅ Email sent:', result?.id)
      return res.json({ ok: true, messageId: result?.id })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[/api/test-email] error', err)
      return res.status(500).json({ ok: false, error: String(err?.message || err) })
    }
  })

  // Demo account login notification endpoint
  app.options('/api/notify-demo-login', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    return res.sendStatus(204)
  })
  app.post('/api/notify-demo-login', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    try {
      const { email, user_id, logged_in_at } = req.body

      if (!email || !user_id) {
        return res.status(400).json({ ok: false, error: 'Missing required fields' })
      }

      // Verify this is actually a demo account (prevent abuse)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_demo_account, full_name')
        .eq('id', user_id)
        .single()

      if (profileError || !profile?.is_demo_account) {
        console.log('[notify-demo-login] Not a demo account or profile not found:', email)
        return res.status(200).json({ ok: true, sent: false, reason: 'Not a demo account' })
      }

      // Send notification email to admin
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'larry@vrexistence.com'
      const loginTime = new Date(logged_in_at).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      const result = await resend.emails.send({
        from: process.env.MAIL_FROM || 'Pet Claim Helper <onboarding@resend.dev>',
        to: [adminEmail],
        subject: `🐾 Demo Account Login: ${email}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Demo Account Login Notification</h2>
            <p>A demo account has logged in to Pet Claim Helper:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Email</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Name</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${profile.full_name || 'Not set'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Login Time</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${loginTime} (Pacific)</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">User ID</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 12px;">${user_id}</td>
              </tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">This is an automated notification from Pet Claim Helper.</p>
          </div>
        `
      })

      console.log('[notify-demo-login] ✅ Notification sent for:', email, 'Message ID:', result?.id)
      return res.json({ ok: true, sent: true, messageId: result?.id })
    } catch (err) {
      console.error('[notify-demo-login] Error:', err)
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
    console.log('[Deadline Reminders] Endpoint called')

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
  // HIDDEN - medication reminders disabled, re-enable when ready
  // SMS medication reminders endpoint
  // app.options('/api/send-medication-reminders', (req, res) => { ... })
  // app.post('/api/send-medication-reminders', async (req, res) => { ... })

  const port = process.env.PORT || 8787
  // HIDDEN - medication reminders disabled, re-enable when ready
  // Cron: medication reminders every minute (using PST timezone)
  // try {
  //   schedule.scheduleJob('* * * * *', async () => {
  //     const result = await runMedicationReminders({ supabase })
  //     console.log('[Cron] Medication reminders result:', { sent: result.sent, skipped: result.skipped })
  //   })
  // } catch (cronErr) {
  //   console.error('[Cron] schedule init failed:', cronErr)
  // }

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

app.post('/api/webhook/ghl-signup', signupLimiter, async (req, res) => {
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

  // Get dose details by short_code (for SMS link display)
  // Uses service role to bypass RLS and return full medication/pet info
  app.get('/api/doses/by-short-code/:shortCode', async (req, res) => {
    try {
      const { shortCode } = req.params
      console.log('[Get Dose] Request for short code:', shortCode)

      if (!shortCode || shortCode.length !== 8) {
        console.log('[Get Dose] Invalid short code length:', shortCode?.length)
        return res.status(400).json({ ok: false, error: 'Invalid short code' })
      }

      // Step 1: Find the dose record
      console.log('[Get Dose] Step 1: Querying medication_doses...')
      const { data: dose, error: doseError } = await supabase
        .from('medication_doses')
        .select('*')
        .eq('short_code', shortCode)
        .single()

      if (doseError || !dose) {
        console.error('[Get Dose] Dose not found:', doseError?.message, doseError?.code)
        return res.status(404).json({
          ok: false,
          error: 'Dose not found or link expired'
        })
      }
      console.log('[Get Dose] Found dose:', { id: dose.id, medicationId: dose.medication_id, status: dose.status })

      // Step 2: Find the medication
      console.log('[Get Dose] Step 2: Querying medications...')
      const { data: medication, error: medError } = await supabase
        .from('medications')
        .select('*')
        .eq('id', dose.medication_id)
        .single()

      if (medError || !medication) {
        console.error('[Get Dose] Medication not found:', medError?.message)
        // Return dose without medication details
        return res.json({
          ok: true,
          dose: {
            id: dose.id,
            status: dose.status,
            scheduledTime: dose.scheduled_time,
            givenTime: dose.given_time,
            shortCode: dose.short_code,
            medicationId: dose.medication_id,
            userId: dose.user_id
          },
          medication: null,
          pet: null
        })
      }
      console.log('[Get Dose] Found medication:', { id: medication.id, name: medication.medication_name, petId: medication.pet_id })

      // Step 3: Find the pet
      console.log('[Get Dose] Step 3: Querying pets...')
      const { data: pet, error: petError } = await supabase
        .from('pets')
        .select('*')
        .eq('id', medication.pet_id)
        .single()

      if (petError) {
        console.error('[Get Dose] Pet not found:', petError?.message)
      } else {
        console.log('[Get Dose] Found pet:', { id: pet?.id, name: pet?.name })
      }

      // Return the complete response
      res.json({
        ok: true,
        dose: {
          id: dose.id,
          status: dose.status,
          scheduledTime: dose.scheduled_time,
          givenTime: dose.given_time,
          shortCode: dose.short_code,
          medicationId: dose.medication_id,
          userId: dose.user_id
        },
        medication: {
          id: medication.id,
          name: medication.medication_name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          reminderTimes: medication.reminder_times
        },
        pet: pet ? {
          id: pet.id,
          name: pet.name,
          species: pet.species
        } : null
      })
    } catch (error) {
      console.error('[Get Dose] Error:', error)
      res.status(500).json({ ok: false, error: 'Server error' })
    }
  })

  // Mark medication dose as given
  // SIMPLIFIED VERSION - removed complex dose count validation
  // Supports three auth methods:
  // 1. Short code (new format) - /dose/Xk7mP9ab
  // 2. Magic link token (legacy format) - /dose/uuid?token=xyz
  // 3. Traditional userId session auth
  app.post('/api/medications/:id/mark-given', async (req, res) => {
    try {
      const { id: medicationId } = req.params
      const { userId, token, shortCode } = req.body
      const nowPST = DateTime.now().setZone('America/Los_Angeles')
      const todayPST = nowPST.toISODate()

      // METHOD 1: Short Code Authentication (SMS links)
      if (shortCode) {
        console.log('[Mark Given] Short code auth attempt:', { shortCode })

        // Find dose by short code
        const { data: dose, error: doseError } = await supabase
          .from('medication_doses')
          .select('*')
          .eq('short_code', shortCode)
          .single()

        if (doseError || !dose) {
          console.error('[Mark Given] Invalid short code:', doseError?.message)
          return res.status(401).json({ ok: false, error: 'Invalid or expired link.' })
        }

        // If already given, return success (idempotent)
        if (dose.status === 'given') {
          console.log('[Mark Given] Dose already marked as given:', dose.id)
          return res.json({ ok: true, message: 'Medication already marked as given' })
        }

        // Mark dose as given
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

        console.log('[Mark Given] ✅ Dose marked via short code:', dose.id)
        return res.json({ ok: true, message: 'Medication marked as given' })
      }

      // METHOD 2: Magic Link Token Authentication (legacy)
      if (token) {
        console.log('[Mark Given] Magic link auth attempt:', { medicationId, token: token.slice(0, 8) + '...' })

        // Find dose by token
        const { data: dose, error: doseError } = await supabase
          .from('medication_doses')
          .select('*')
          .eq('medication_id', medicationId)
          .eq('one_time_token', token)
          .single()

        if (doseError || !dose) {
          console.error('[Mark Given] Invalid or expired token:', doseError?.message)
          return res.status(401).json({ ok: false, error: 'Invalid or expired link. Please check your recent SMS.' })
        }

        // If already given, return success (idempotent)
        if (dose.status === 'given') {
          console.log('[Mark Given] Dose already marked as given:', dose.id)
          return res.json({ ok: true, message: 'Medication already marked as given' })
        }

        // Check token expiration
        if (dose.token_expires_at) {
          const expiresAt = DateTime.fromISO(dose.token_expires_at)
          if (nowPST > expiresAt) {
            console.error('[Mark Given] Token expired:', { expiresAt: expiresAt.toISO(), now: nowPST.toISO() })
            return res.status(401).json({ ok: false, error: 'This link has expired. Please check for a newer SMS.' })
          }
        }

        // Mark dose as given and DELETE token (single use)
        const { error: updateError } = await supabase
          .from('medication_doses')
          .update({
            status: 'given',
            given_time: nowPST.toISO(),
            one_time_token: null,
            token_expires_at: null
          })
          .eq('id', dose.id)

        if (updateError) {
          console.error('[Mark Given] Error updating dose:', updateError)
          return res.status(500).json({ ok: false, error: 'Error marking dose as given' })
        }

        console.log('[Mark Given] ✅ Dose marked via magic link:', dose.id)
        return res.json({ ok: true, message: 'Medication marked as given' })
      }

      // METHOD 3: Session Authentication (logged-in users)
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[Mark Given] Session auth - no authorization header')
        return res.status(401).json({ ok: false, error: 'Authorization token required' })
      }
      const authToken = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(authToken)
      if (authError || !user) {
        console.error('[Mark Given] Session auth - invalid token:', authError?.message)
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
      }
      if (userId && user.id !== userId) {
        console.error('[Mark Given] Session auth - user mismatch:', { authenticated: user.id, claimed: userId })
        return res.status(403).json({ ok: false, error: 'Forbidden - user mismatch' })
      }
      const authenticatedUserId = user.id

      console.log('[Mark Given] Session auth attempt:', { medicationId, userId: authenticatedUserId })

      // Get the medication to verify ownership
      const { data: medication, error: medError } = await supabase
        .from('medications')
        .select('*')
        .eq('id', medicationId)
        .eq('user_id', authenticatedUserId)
        .single()

      if (medError || !medication) {
        return res.status(404).json({ ok: false, error: 'Medication not found' })
      }

      // SIMPLIFIED: Insert a new dose log entry for today
      // This replaces the old "find pending dose and update" logic
      const { data: newDose, error: insertError } = await supabase
        .from('medication_doses')
        .insert({
          medication_id: medicationId,
          user_id: authenticatedUserId,
          status: 'given',
          given_time: nowPST.toISO(),
          scheduled_time: nowPST.toISO(),
          dose_date: todayPST
        })
        .select()
        .single()

      if (insertError) {
        // Handle unique constraint - already given for this slot
        if (insertError.code === '23505') {
          console.log('[Mark Given] Dose already recorded for this slot')
          return res.json({ ok: true, message: 'Medication already marked as given' })
        }
        console.error('[Mark Given] Error inserting dose:', insertError)
        return res.status(500).json({ ok: false, error: 'Error marking dose as given' })
      }

      console.log('[Mark Given] ✅ Dose marked via session:', newDose?.id)
      return res.json({ ok: true, doseId: newDose?.id })
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

      // 5. Build existingData object with ALL field values (not just missing ones)
      // This allows the MissingFieldsModal to pre-fill existing values
      const allRequiredFields = getRequiredFieldsForInsurer(insurer)
      const existingData = {}

      // Field value mapping (matches getFieldValue in claimFormMappings.js)
      const fieldValueMap = {
        // Profile fields
        'signature': profile?.signature,
        'policyholderName': profile?.full_name,
        'policyholderPhone': profile?.phone,
        'policyholderAddress': profile?.address,
        'policyholderEmail': profile?.email,
        'address': profile?.address,
        'city': profile?.city,
        'state': profile?.state,
        'zip': profile?.zip,

        // Pet fields
        'policyNumber': pet?.policy_number,
        'healthyPawsPetId': pet?.healthy_paws_pet_id,
        'pumpkinAccountNumber': pet?.pumpkin_account_number,
        'spotAccountNumber': pet?.spot_account_number,
        'breed': pet?.breed,
        'gender': pet?.gender,
        'dateOfBirth': pet?.date_of_birth,
        'petDateOfBirth': pet?.date_of_birth,  // Alternative field name
        'adoptionDate': pet?.adoption_date,
        'spayNeuterStatus': pet?.spay_neuter_status,
        'spayNeuterDate': pet?.spay_neuter_date,
        'treatingVet': pet?.preferred_vet_name,
        'hadOtherInsurance': pet?.had_other_insurance,
        'otherInsuranceProvider': pet?.other_insurance_provider,
        'otherInsuranceCancelDate': pet?.other_insurance_cancel_date,
        'otherHospitalsVisited': pet?.other_hospitals_visited,

        // Claim fields
        'bodyPartAffected': claim?.body_part,
        'previousClaimSameCondition': claim?.previous_claim_same_condition,
        'previousClaimNumber': claim?.previous_claim_number,
        'paymentMethod': claim?.payment_method,
        'claimType': claim?.claim_type,
      }

      // Populate existingData with values that exist
      for (const fieldDef of allRequiredFields) {
        const value = fieldValueMap[fieldDef.field]
        if (value !== null && value !== undefined && value !== '') {
          existingData[fieldDef.field] = value
        }
      }

      // 6. AI extraction for fields with aiExtract flag
      const suggestedValues = {}
      for (const fieldDef of missingFields) {
        if (fieldDef.aiExtract && fieldDef.aiPrompt) {
          try {
            // Extract data using AI (e.g., body part from diagnosis)
            const extractedValue = await extractFieldWithAI(
              fieldDef,
              { profile, pet, claim }
            )

            if (extractedValue) {
              // Add the extracted value to the suggested values
              suggestedValues[fieldDef.field] = extractedValue
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
        existingData,
        suggestedValues,
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

      console.log('[Save Collected Fields] Processing:', claimId)

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

      // Save city, state, zip to profiles table
      if (collectedData.city) {
        const { error: cityError } = await supabase
          .from('profiles')
          .update({ city: collectedData.city })
          .eq('id', userId)

        if (cityError) {
          console.error('[Save Collected Fields] Error saving city:', cityError)
        } else {
          console.log('[Save Collected Fields] Saved city:', collectedData.city)
        }
      }

      if (collectedData.state) {
        const { error: stateError } = await supabase
          .from('profiles')
          .update({ state: collectedData.state })
          .eq('id', userId)

        if (stateError) {
          console.error('[Save Collected Fields] Error saving state:', stateError)
        } else {
          console.log('[Save Collected Fields] Saved state:', collectedData.state)
        }
      }

      if (collectedData.zip) {
        const { error: zipError} = await supabase
          .from('profiles')
          .update({ zip: collectedData.zip })
          .eq('id', userId)

        if (zipError) {
          console.error('[Save Collected Fields] Error saving zip:', zipError)
        } else {
          console.log('[Save Collected Fields] Saved zip:', collectedData.zip)
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

      // Save pumpkin_account_number to pets table
      if (collectedData.pumpkinAccountNumber) {
        const { error: pumpkinError } = await supabase
          .from('pets')
          .update({ pumpkin_account_number: collectedData.pumpkinAccountNumber })
          .eq('id', petId)

        if (pumpkinError) {
          console.error('[Save Collected Fields] Error saving Pumpkin Account Number:', pumpkinError)
        } else {
          console.log('[Save Collected Fields] Saved Pumpkin Account Number:', collectedData.pumpkinAccountNumber)
        }
      }

      // Save breed to pets table
      if (collectedData.breed) {
        const { error: breedError } = await supabase
          .from('pets')
          .update({ breed: collectedData.breed })
          .eq('id', petId)

        if (breedError) {
          console.error('[Save Collected Fields] Error saving breed:', breedError)
        } else {
          console.log('[Save Collected Fields] Saved breed:', collectedData.breed)
        }
      }

      // Save gender to pets table
      if (collectedData.gender) {
        const { error: genderError } = await supabase
          .from('pets')
          .update({ gender: collectedData.gender })
          .eq('id', petId)

        if (genderError) {
          console.error('[Save Collected Fields] Error saving gender:', genderError)
        } else {
          console.log('[Save Collected Fields] Saved gender:', collectedData.gender)
        }
      }

      // Save date_of_birth to pets table
      if (collectedData.dateOfBirth) {
        const { error: dobError } = await supabase
          .from('pets')
          .update({ date_of_birth: collectedData.dateOfBirth })
          .eq('id', petId)

        if (dobError) {
          console.error('[Save Collected Fields] Error saving date_of_birth:', dobError)
        } else {
          console.log('[Save Collected Fields] Saved date_of_birth:', collectedData.dateOfBirth)
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

      // ========== CLAIM-SPECIFIC FIELDS (save to claims table) ==========

      // Save claimType to claims table (for Pumpkin/Spot)
      if (collectedData.claimType) {
        const { error: claimTypeError } = await supabase
          .from('claims')
          .update({ claim_type: collectedData.claimType })
          .eq('id', claimId)

        if (claimTypeError) {
          console.error('[Save Collected Fields] Error saving claim type:', claimTypeError)
        } else {
          console.log('[Save Collected Fields] Saved claim type:', collectedData.claimType)
        }
      }

      // Save age to claims table (for Pumpkin and Spot - both ask for age with saveToDb: false)
      if (collectedData.age) {
        const { error: ageError } = await supabase
          .from('claims')
          .update({ age: collectedData.age })
          .eq('id', claimId)

        if (ageError) {
          console.error('[Save Collected Fields] Error saving age:', ageError)
        } else {
          console.log('[Save Collected Fields] Saved age:', collectedData.age)
        }
      }

      // Note: These are claim-specific, will be saved to claims table above:
      // - claimType (Pumpkin/Spot) ✅ SAVED
      // - age (Pumpkin/Spot) ✅ SAVED
      // - bodyPartAffected (Nationwide) - TODO: save to claims.body_part
      // - previousClaimSameCondition (Trupanion) - TODO: save to claims.previous_claim_same_condition
      // - previousClaimNumber (Trupanion) - TODO: save to claims.previous_claim_number
      // - paymentMethod (Trupanion) - TODO: save to claims.payment_method

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
            gender,
            policy_number,
            insurance_company,
            preferred_vet_name,
            adoption_date,
            spay_neuter_status,
            spay_neuter_date,
            healthy_paws_pet_id,
            pumpkin_account_number,
            spot_account_number,
            figo_policy_number,
            odie_connected,
            odie_policy_number
          )
        `)
        .eq('id', claimId)
        .eq('user_id', userId)
        .single()

      if (claimError || !claim) {
        console.error('[Submit Claim] Claim not found:', claimError)
        return res.status(404).json({ ok: false, error: 'Claim not found' })
      }

      // 2. Get user profile data (including is_demo_account flag)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError || !profile) {
        console.error('[Submit Claim] Profile not found:', profileError)
        return res.status(404).json({ ok: false, error: 'User profile not found' })
      }


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

      // 4. Build claim data object for PDF/email
      const claimData = {
        policyholderName: profile.full_name || profile.email,
        policyholderAddress: profile.address || '',
        policyholderPhone: profile.phone || '',
        policyholderEmail: profile.email,
        // Address fields for Pumpkin and other insurers
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        zip: profile.zip || '',
        policyNumber: claim.pets.policy_number || 'N/A',  // Get from pets table, not claims table
        healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
        pumpkinAccountNumber: claim.pets.pumpkin_account_number || '',  // For Pumpkin form
        spotAccountNumber: claim.pets.spot_account_number || '',  // For Spot form
        figoPolicyNumber: claim.pets.figo_policy_number || '',  // For Figo form
        petName: claim.pets.name,
        petSpecies: claim.pets.species,
        breed: claim.pets.breed || '',  // For Pumpkin (uses 'breed' not 'petBreed')
        petBreed: claim.pets.breed || '',  // For other insurers
        petAge: claim.age || petAge,  // Prefer direct user input (Spot), fallback to calculated (others)
        petGender: claim.pets.gender || '',  // For Spot form
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
        previousClaimSameCondition: claim.previous_claim_same_condition || 'No',

        // Pumpkin: Claim type (Accident/Illness/Preventive)
        claimType: claim.claim_type || null,

        // Pumpkin/Spot: Pet age (direct user input from MFM, saveToDb: false but saved to claims.age)
        age: claim.age || null
      }

      // 5. Validate claim data
      try {
        validateClaimData(claimData)
      } catch (validationError) {
        console.error('[Submit Claim] Validation failed:', validationError.message)
        return res.status(400).json({ ok: false, error: `Invalid claim data: ${validationError.message}` })
      }

      // 6. Get insurer from pet's insurance company
      const rawInsurer = claim.pets?.insurance_company
      const insurer = rawInsurer?.toLowerCase()
      if (!insurer) {
        const petName = claim.pets?.name || 'Unknown'
        console.error('[Submit Claim] Pet has no insurance company:', petName)
        return res.status(400).json({
          ok: false,
          error: `Pet ${petName} has no insurance company set. Please update the pet's insurance company before submitting.`
        })
      }

      // -----------------------------------------------------------------------
      // 7. ODIE API PATH — if pet is connected to Odie, submit via API
      // -----------------------------------------------------------------------
      if (claim.pets?.odie_connected && claim.pets?.odie_policy_number) {
        console.log('[Submit Claim] Odie-connected pet detected, attempting API submission')

        try {
          const odieApiKey = process.env.ODIE_API_KEY?.trim()
          const odieBaseUrl = process.env.ODIE_API_BASE_URL?.trim()
          if (!odieApiKey || !odieBaseUrl) {
            throw new Error('Missing ODIE_API_KEY or ODIE_API_BASE_URL env vars')
          }

          const odiePolicyNumber = claim.pets.odie_policy_number
          const now = new Date().toISOString()

          // Map expense_category / claim_type to Odie category
          const rawCategory = (claim.expense_category || claim.claim_type || '').toLowerCase()
          let odieCategory = 'CLAIMTYPEILLNESS' // default
          if (/accident|emergency/.test(rawCategory)) {
            odieCategory = 'CLAIMTYPEACCIDENT'
          } else if (/illness|medication/.test(rawCategory)) {
            odieCategory = 'CLAIMTYPEILLNESS'
          } else if (/routine|wellness|checkup/.test(rawCategory)) {
            odieCategory = 'CLAIMTYPEROUTINE'
          }

          // Parse vet address into structured fields
          // Expected format: "street, city, state zip" e.g. "21157 Newport Coast Dr, Newport Coast, CA 92657"
          const clinicAddr = claim.clinic_address || ''
          let parsedLine1 = ''
          let parsedCity = ''
          let parsedState = ''
          let parsedZip = ''

          // Try to match "street, city, STATE ZIP" pattern
          const addrMatch = clinicAddr.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
          if (addrMatch) {
            parsedLine1 = addrMatch[1].trim()
            parsedCity = addrMatch[2].trim()
            parsedState = addrMatch[3].trim().toUpperCase()
            parsedZip = addrMatch[4].trim()
          } else {
            // Fallback: split by comma, extract zip via regex
            const parts = clinicAddr.split(',').map(s => s.trim())
            parsedLine1 = parts[0] || ''
            parsedCity = parts[1] || ''
            const zipMatch = clinicAddr.match(/\b(\d{5}(?:-\d{4})?)\b/)
            if (zipMatch) parsedZip = zipMatch[1]
            const stateMatch = clinicAddr.match(/\b([A-Z]{2})\s+\d{5}/i)
            if (stateMatch) parsedState = stateMatch[1].toUpperCase()
          }

          // Step 1: Submit claim to Odie
          const odieClaimPayload = {
            dateOfService: claim.service_date || claim.created_at?.split('T')[0],
            category: odieCategory,
            amountClaimed: Number(claim.total_amount) || 0,
            description: claim.visit_title || claim.diagnosis || claim.ai_diagnosis || 'Veterinary visit',
            veterinaryPractice: {
              practiceName: claim.clinic_name || claim.pets.preferred_vet_name || 'Veterinary Clinic',
              contact: {
                line1: parsedLine1,
                city: parsedCity,
                state: parsedState,
                zipCode: parsedZip,
                country: 'USA',
                phone: claim.clinic_phone || '',
              },
            },
            pecAcknowledgment: true,
            certifiedInfoAck: now,
            crimeAck: now,
            webhook: 'https://pet-claim-helper.onrender.com/api/odie/webhook',
          }

          console.log('[Submit Claim] [Odie] Submitting claim to Odie API:', {
            policy: odiePolicyNumber,
            category: odieCategory,
            amount: odieClaimPayload.amountClaimed,
          })

          const claimResponse = await fetch(
            `${odieBaseUrl}/v1/policy/${encodeURIComponent(odiePolicyNumber)}/claims`,
            {
              method: 'POST',
              headers: { 'x-api-key': odieApiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify(odieClaimPayload),
            }
          )

          const claimResult = await claimResponse.json()

          if (!claimResponse.ok) {
            throw new Error(`Odie claim submit failed (${claimResponse.status}): ${claimResult.message || JSON.stringify(claimResult)}`)
          }

          const odieClaimNumber = claimResult.claimNumber
          console.log(`[Submit Claim] [Odie] Claim created: ${odieClaimNumber}`)

          // Step 2: Upload invoice PDF if available
          if (claim.pdf_path) {
            try {
              const { data: invoiceData, error: storageError } = await supabase.storage
                .from('claim-pdfs')
                .download(claim.pdf_path)

              if (storageError) {
                console.error('[Submit Claim] [Odie] Failed to fetch invoice PDF:', storageError)
              } else if (invoiceData) {
                const invoiceBuffer = Buffer.from(await invoiceData.arrayBuffer())

                // Use global FormData/Blob (available in Node 18+)
                const form = new FormData()
                const blob = new Blob([invoiceBuffer], { type: 'application/pdf' })
                form.append('document', blob, 'invoice.pdf')
                form.append('documentType', 'Veterinary_Invoice')

                const uploadResponse = await fetch(
                  `${odieBaseUrl}/v2/claim/${encodeURIComponent(odieClaimNumber)}/documents`,
                  {
                    method: 'POST',
                    headers: { 'x-api-key': odieApiKey },
                    body: form,
                  }
                )

                if (!uploadResponse.ok) {
                  const uploadErr = await uploadResponse.json().catch(() => ({}))
                  console.error(`[Submit Claim] [Odie] Document upload failed (${uploadResponse.status}):`, uploadErr)
                } else {
                  console.log(`[Submit Claim] [Odie] Invoice uploaded to claim ${odieClaimNumber}`)

                  // Step 3: Mark documents ready for review
                  const reviewResponse = await fetch(
                    `${odieBaseUrl}/v2/claim/${encodeURIComponent(odieClaimNumber)}/review-documents`,
                    {
                      method: 'PATCH',
                      headers: { 'x-api-key': odieApiKey, 'Content-Type': 'application/json' },
                    }
                  )

                  if (!reviewResponse.ok) {
                    const reviewErr = await reviewResponse.json().catch(() => ({}))
                    console.error(`[Submit Claim] [Odie] Review-documents failed (${reviewResponse.status}):`, reviewErr)
                  } else {
                    console.log(`[Submit Claim] [Odie] Claim ${odieClaimNumber} marked ready for review`)
                  }
                }
              }
            } catch (docErr) {
              console.error('[Submit Claim] [Odie] Document upload/review error (non-fatal):', docErr.message)
            }
          }

          // Step 4: Update claims table
          const { error: odieUpdateError } = await supabase
            .from('claims')
            .update({
              filing_status: 'submitted',
              submitted_at: new Date().toISOString(),
              odie_claim_number: odieClaimNumber,
              odie_claim_status: 'CLAIMSUBMITTED',
              submitted_via_api: true,
            })
            .eq('id', claimId)

          if (odieUpdateError) {
            console.error('[Submit Claim] [Odie] Failed to update claim status:', odieUpdateError)
          }

          console.log(`[Submit Claim] [Odie] ✅ Claim ${claimId} submitted via Odie API (${odieClaimNumber})`)

          return res.json({
            ok: true,
            message: 'Claim submitted successfully via Odie API',
            messageId: odieClaimNumber,
            odieClaimNumber,
            submittedViaApi: true,
            insurer,
          })

        } catch (odieErr) {
          console.error('[Submit Claim] [Odie] API submission failed:', odieErr.message)
          return res.status(500).json({
            ok: false,
            error: 'Odie submission failed',
            details: odieErr.message,
          })
        }
      }

      // -----------------------------------------------------------------------
      // 8. PDF/EMAIL PATH — for non-Odie pets only
      // -----------------------------------------------------------------------

      // 8a. Generate PDF
      // Format date as MM/DD/YYYY for all PDF forms
      const today = new Date()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const yyyy = today.getFullYear()
      const dateSigned = `${mm}/${dd}/${yyyy}`

      const pdfBuffer = await generateClaimFormPDF(
        insurer,
        claimData,
        profile.signature || profile.full_name || profile.email.split('@')[0],
        dateSigned
      )

      // 8b. Fetch invoice PDF from storage if it exists
      let invoiceBuffer = null
      if (claim.pdf_path) {
        try {
          const { data: invoiceData, error: storageError } = await supabase.storage
            .from('claim-pdfs')
            .download(claim.pdf_path)

          if (storageError) {
            console.error('[Submit Claim] Failed to fetch invoice PDF:', storageError)
            // Continue without invoice - don't fail submission
          } else if (invoiceData) {
            invoiceBuffer = Buffer.from(await invoiceData.arrayBuffer())
          }
        } catch (err) {
          console.error('[Submit Claim] Error fetching invoice:', err)
          // Continue without invoice - don't fail submission
        }
      }

      // 8c. Send email to insurer (with both claim form and invoice)
      // Pass is_demo_account flag to route demo account claims to safe test email
      const isDemoAccount = profile.is_demo_account || false
      const emailResult = await sendClaimEmail(insurer, claimData, pdfBuffer, invoiceBuffer, isDemoAccount)

      if (!emailResult.success) {
        console.error('[Submit Claim] Email failed:', emailResult.error)
        return res.status(500).json({ ok: false, error: `Failed to send email: ${emailResult.error}` })
      }

      // 8d. Update claim status in database
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
      }

      console.log('[Submit Claim] ✅ Claim submitted successfully:', claimId)

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
            gender,
            policy_number,
            insurance_company,
            preferred_vet_name,
            adoption_date,
            spay_neuter_status,
            spay_neuter_date,
            healthy_paws_pet_id,
            pumpkin_account_number,
            spot_account_number,
            figo_policy_number
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
        // Address fields for Pumpkin and other insurers
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        zip: profile.zip || '',
        policyNumber: claim.pets.policy_number || 'N/A',
        healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
        pumpkinAccountNumber: claim.pets.pumpkin_account_number || '',  // For Pumpkin form
        spotAccountNumber: claim.pets.spot_account_number || '',  // For Spot form
        figoPolicyNumber: claim.pets.figo_policy_number || '',  // For Figo form
        petName: claim.pets.name,
        petSpecies: claim.pets.species,
        breed: claim.pets.breed || '',  // For Pumpkin (uses 'breed' not 'petBreed')
        petGender: claim.pets.gender || '',  // For Spot form
        petBreed: claim.pets.breed || '',
        petAge: claim.age || petAge,  // Prefer direct user input (Spot), fallback to calculated (others)
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
        paymentMethod: claim.payment_method || 'I have paid in full',

        // Pumpkin: Claim type (Accident/Illness/Preventive)
        claimType: claim.claim_type || null,

        // Spot: Pet age (direct user input, not calculated)
        age: claim.age || null
      }

      // Get insurer from pet's insurance company
      const rawInsurer = claim.pets?.insurance_company
      const insurer = rawInsurer?.toLowerCase()
      if (!insurer) {
        const petName = claim.pets?.name || 'Unknown'
        console.error('[Preview PDF] Pet has no insurance company:', petName)
        return res.status(400).json({
          ok: false,
          error: `Pet ${petName} has no insurance company set. Please update the pet's insurance company.`
        })
      }

      // Generate PDF
      // Format date as MM/DD/YYYY for all PDF forms
      const today = new Date()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const yyyy = today.getFullYear()
      const dateSigned = `${mm}/${dd}/${yyyy}`

      const pdfBuffer = await generateClaimFormPDF(
        insurer,
        claimData,
        profile.signature || profile.full_name || user.email.split('@')[0],
        dateSigned
      )

      // Check if we should merge with vet invoice
      const merged = req.query.merged === 'true'

      if (merged && claim.pdf_path) {
        try {
          // Download vet invoice from storage
          const { data: invoiceData, error: storageError } = await supabase.storage
            .from('claim-pdfs')
            .download(claim.pdf_path)

          if (storageError) {
            console.error('[Preview PDF] Storage error fetching invoice:', storageError.message)
            // Return error to frontend so user knows merge failed
            return res.status(500).json({
              ok: false,
              error: 'Failed to fetch vet invoice from storage',
              details: storageError.message,
              fallback: 'claim-form-only'
            })
          }

          if (!invoiceData) {
            console.error('[Preview PDF] No invoice data returned from storage')
            return res.status(500).json({
              ok: false,
              error: 'Vet invoice file not found in storage',
              fallback: 'claim-form-only'
            })
          }

          // Load both PDFs for merge
          const claimFormPdf = await PDFDocument.load(pdfBuffer)
          const invoiceBuffer = Buffer.from(await invoiceData.arrayBuffer())

          // Detect file type by checking magic bytes
          let invoicePdf
          const isImage = detectImageType(invoiceBuffer)

          if (isImage) {
            // Invoice is an image (mobile camera upload) - convert to PDF first
            // Letter page: 8.5 x 11 inches = 612 x 792 points (at 72 DPI)
            const PAGE_WIDTH = 612
            const PAGE_HEIGHT = 792
            const MARGIN = 36 // 0.5 inch margins

            try {
              // Load image with Jimp (automatically handles EXIF orientation)
              const image = await Jimp.read(invoiceBuffer)

              // Calculate target dimensions to fit within page with margins
              const maxWidth = PAGE_WIDTH - (MARGIN * 2)  // 540 points
              const maxHeight = PAGE_HEIGHT - (MARGIN * 2) // 720 points

              // Resize to fit within bounds while maintaining aspect ratio
              image.scaleToFit({ w: maxWidth, h: maxHeight })

              // Convert to JPEG buffer with quality 85
              const processedImageBuffer = await image.getBuffer('image/jpeg', { quality: 85 })

              // Get final dimensions
              const processedWidth = image.bitmap.width
              const processedHeight = image.bitmap.height

              // Create PDF and embed processed image
              invoicePdf = await PDFDocument.create()
              const embeddedImage = await invoicePdf.embedJpg(processedImageBuffer)

              // Create letter-sized page
              const page = invoicePdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])

              // Calculate centered position
              const xPos = (PAGE_WIDTH - processedWidth) / 2
              const yPos = (PAGE_HEIGHT - processedHeight) / 2

              // Draw image centered on page
              page.drawImage(embeddedImage, {
                x: xPos,
                y: yPos,
                width: processedWidth,
                height: processedHeight,
              })
            } catch (imageError) {
              console.error('[Preview PDF] Error processing image:', imageError.message)
              // Fallback: use original image without processing
              invoicePdf = await PDFDocument.create()

              let embeddedImage
              if (isImage === 'jpeg' || isImage === 'jpg') {
                embeddedImage = await invoicePdf.embedJpg(invoiceBuffer)
              } else if (isImage === 'png') {
                embeddedImage = await invoicePdf.embedPng(invoiceBuffer)
              }

              const page = invoicePdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
              // Scale to fit page
              const scale = Math.min(
                (PAGE_WIDTH - MARGIN * 2) / embeddedImage.width,
                (PAGE_HEIGHT - MARGIN * 2) / embeddedImage.height
              )
              const scaledWidth = embeddedImage.width * scale
              const scaledHeight = embeddedImage.height * scale
              const xPos = (PAGE_WIDTH - scaledWidth) / 2
              const yPos = (PAGE_HEIGHT - scaledHeight) / 2

              page.drawImage(embeddedImage, {
                x: xPos,
                y: yPos,
                width: scaledWidth,
                height: scaledHeight,
              })
            }
          } else {
            // Invoice is already a PDF
            invoicePdf = await PDFDocument.load(invoiceBuffer)
          }

          // Create new merged PDF
          const mergedPdf = await PDFDocument.create()

          // Copy all pages from claim form FIRST
          const claimPages = await mergedPdf.copyPages(claimFormPdf, claimFormPdf.getPageIndices())
          claimPages.forEach((page) => mergedPdf.addPage(page))

          // Copy all pages from original vet invoice SECOND
          const invoicePages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices())
          invoicePages.forEach((page) => mergedPdf.addPage(page))

          // Save merged PDF
          const mergedPdfBytes = await mergedPdf.save()

          console.log('[Preview PDF] ✅ Merged PDF created:', mergedPdf.getPageCount(), 'pages')

          // Return merged PDF
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Disposition', 'inline; filename="claim-with-invoice.pdf"')
          return res.send(Buffer.from(mergedPdfBytes))

        } catch (mergeError) {
          console.error('[Preview PDF] Merge error:', mergeError.message)
          // Return error to frontend instead of silently falling back
          return res.status(500).json({
            ok: false,
            error: 'Failed to merge claim form with vet invoice',
            details: mergeError.message,
            fallback: 'merge-failed'
          })
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

  // ========================================
  // PET CLAIM IQ - Public Claim Analysis API
  // ========================================
  // Analyzes vet bills against insurance policies
  // NO authentication required - completely public
  // Does NOT store any data - stateless processing
  // ========================================

  // Rate limiter for public claim analysis (prevents abuse)
  const analyzeClaimLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per IP per 15 minutes
    message: { ok: false, error: 'Too many analysis requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
  })

  // Multer config for multi-file upload (4 files max, 10MB each)
  const analyzeUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
      files: 4
    },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      ]
      if (allowedMimes.includes(file.mimetype) ||
          file.originalname.toLowerCase().endsWith('.pdf') ||
          file.originalname.toLowerCase().endsWith('.jpg') ||
          file.originalname.toLowerCase().endsWith('.jpeg') ||
          file.originalname.toLowerCase().endsWith('.png') ||
          file.originalname.toLowerCase().endsWith('.webp') ||
          file.originalname.toLowerCase().endsWith('.heic') ||
          file.originalname.toLowerCase().endsWith('.heif')) {
        cb(null, true)
      } else {
        cb(new Error(`Unsupported file format: ${file.mimetype}. Please upload PDF or image files.`))
      }
    }
  })

  // CORS preflight for analyze-claim
  app.options('/api/analyze-claim', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Max-Age', '86400')
    return res.sendStatus(204)
  })

  // Pet Claim IQ - Analyze claim against policy
  app.post('/api/analyze-claim', analyzeClaimLimiter, (req, res, next) => {
    // Set CORS headers for all responses
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    // Handle multipart upload with field names
    analyzeUpload.fields([
      { name: 'vetBill', maxCount: 1 },
      { name: 'insuranceDocs', maxCount: 5 }
    ])(req, res, async (uploadError) => {
      if (uploadError) {
        console.error('[analyze-claim] Upload error:', uploadError.message)
        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'File too large. Maximum size is 10MB per file.' })
        }
        return res.status(400).json({ ok: false, error: uploadError.message })
      }

      try {
        if (!process.env.OPENAI_API_KEY) {
          return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' })
        }

        const files = req.files || {}
        const vetBillFile = files.vetBill?.[0]
        const insuranceDocsFiles = files.insuranceDocs || []
        const crossTestingMode = req.body?.crossTestingMode === 'true'
        console.log('[analyze-claim] Cross-Testing Mode:', crossTestingMode)

        // Validate required files
        if (!vetBillFile) {
          return res.status(400).json({ ok: false, error: 'Vet bill is required. Please upload a PDF or image of your veterinary invoice.' })
        }

        console.log('[analyze-claim] Processing files:', {
          vetBill: { name: vetBillFile.originalname, size: vetBillFile.size, mime: vetBillFile.mimetype },
          insuranceDocs: insuranceDocsFiles.map(f => ({ name: f.originalname, size: f.size }))
        })

        // Helper function to extract text from PDF
        const extractPdfText = async (buffer, filename) => {
          try {
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
            const pieces = []
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i)
              const content = await page.getTextContent()
              const pageText = (content.items || []).map((it) => (it.str || '')).join(' ')
              pieces.push(pageText)
            }
            console.log(`[analyze-claim] Extracted ${pieces.length} pages from ${filename}`)
            return pieces.join('\n\n')
          } catch (err) {
            console.error(`[analyze-claim] PDF extraction failed for ${filename}:`, err.message)
            throw new Error(`Failed to read PDF: ${filename}`)
          }
        }

        // Helper to check if file is PDF
        const isPdf = (file) => {
          return file.mimetype === 'application/pdf' ||
                 file.originalname.toLowerCase().endsWith('.pdf')
        }

        // Helper to convert file to base64 data URL for OpenAI Vision
        const toDataUrl = (file) => {
          const base64 = file.buffer.toString('base64')
          const mime = file.mimetype || 'image/jpeg'
          return `data:${mime};base64,${base64}`
        }

        // Helper to convert PDF buffer to OpenAI file input format
        const pdfToFileInput = (buffer, filename) => {
          const base64 = buffer.toString('base64')
          return {
            type: 'file',
            file: {
              filename: filename,
              file_data: `data:application/pdf;base64,${base64}`
            }
          }
        }

        // Process files — split into vet bill only (Stage 1) and policy docs only (Stage 2)
        const vetBillTextBackup = []
        const policyTextBackup = []
        const vetBillFileContents = [] // Stage 1: vet bill only
        const policyFileContents = []  // Stage 2: policy docs only

        // Process vet bill (Stage 1 only)
        if (isPdf(vetBillFile)) {
          vetBillFileContents.push(pdfToFileInput(vetBillFile.buffer, vetBillFile.originalname))
          console.log(`[analyze-claim] Added vet bill PDF: ${vetBillFile.originalname}`)
          const text = await extractPdfText(vetBillFile.buffer, vetBillFile.originalname)
          vetBillTextBackup.push(`=== VET BILL (text backup) ===\n${text}`)
        } else {
          vetBillFileContents.push({
            type: 'image_url',
            image_url: { url: toDataUrl(vetBillFile), detail: 'high' }
          })
        }

        // Process insurance documents (Stage 2 only)
        for (let i = 0; i < insuranceDocsFiles.length; i++) {
          const docFile = insuranceDocsFiles[i]
          if (isPdf(docFile)) {
            policyFileContents.push(pdfToFileInput(docFile.buffer, docFile.originalname))
            console.log(`[analyze-claim] Added policy PDF: ${docFile.originalname}`)
            const text = await extractPdfText(docFile.buffer, docFile.originalname)
            policyTextBackup.push(`=== INSURANCE DOC ${i + 1} (text backup) ===\n${text}`)
          } else {
            policyFileContents.push({
              type: 'image_url',
              image_url: { url: toDataUrl(docFile), detail: 'high' }
            })
          }
        }

        // ============================================================
        // ORIGINAL SINGLE-STAGE PROMPT — KEPT FOR REFERENCE
        // Replaced by two-stage pipeline below: extractionPrompt + coveragePrompt
        // ============================================================
        // Build the analysis prompt
        const analysisPrompt = `You are an expert pet insurance claim analyst. Analyze the provided vet bill against any insurance policy documents and provide a detailed coverage analysis.

IMPORTANT: PDF documents and images are attached directly. Carefully examine EACH attached document:
- The vet bill shows line items and charges
- The declarations page (usually 1 page) contains tables with reimbursement rate, deductible, annual limit, and pet schedule
- Policy documents contain coverage details, exclusions, and terms

TEXT BACKUP (may be incomplete - always prefer examining the actual documents):
[kept for reference — variable renamed to vetBillTextBackup / policyTextBackup in two-stage pipeline]

STEP 1 — ASSESS DOCUMENT COMPLETENESS:
First, determine what documents you received and what information you can extract:
- Did you receive a vet bill/invoice? (required)
- Can you identify the insurance company? Use the CONSUMER-FACING BRAND NAME, not the underwriting entity. For example: "Healthy Paws" not "Westchester Fire Insurance Company", "Pumpkin" not "United States Fire Insurance Company", "Fetch" not "American Pet Insurance Company". If you see an underwriter name, look for the actual pet insurance brand name in the documents.

Known underwriter-to-brand mappings:
- "Westchester Fire Insurance Company" = "Healthy Paws"
- "United States Fire Insurance Company" = "Pumpkin"
- "American Pet Insurance Company" = "Fetch"
- "Independence American Insurance Company" = "Figo"
- "National Casualty Company" = "Nationwide Pet Insurance"
If you see any of these underwriter names, ALWAYS use the brand name instead.
- Can you determine the reimbursement rate?
- Can you determine the annual deductible?
- Can you determine the annual limit?
- Can you determine what's covered vs excluded?

Set "completeness" to one of:
- "full" — You have the vet bill AND enough policy info to do a complete analysis
- "partial" — You have the vet bill and SOME policy info but are missing key details
- "bill_only" — You only have the vet bill, no usable insurance documents

If "partial", list exactly what's missing in "missingInfo" array with user-friendly descriptions like:
- "Your reimbursement rate (the percentage your insurer pays back, usually 70%, 80%, or 90%)"
- "Your annual deductible amount"
- "Your policy's exclusion list (to determine which charges are covered)"

Also include "missingDocumentHint" — a helpful suggestion like:
- "Look for an email from Healthy Paws with your 'declarations page' — it shows your deductible, reimbursement rate, and limits."

STEP 2 — EXTRACT VET BILL DETAILS:
Extract every line item with its description and amount. Be EXTREMELY careful to match each description to its correct dollar amount — read across each row of the invoice precisely. Items with $0.00 amounts should still be listed.
- Identify the clinic name, date, and total bill amount
- Look for pet information (name, species, breed) if visible
- Double-check that all line item amounts sum to the invoice total

LINE ITEM AMOUNT ACCURACY: When extracting amounts from vet bills, follow these rules strictly:
1. Always use the TOTAL column (rightmost dollar amount) for each line item, never the Quantity or Unit Price columns.
2. Vet bills typically have columns: Description | Quantity | Total (or Description | Staff | Quantity | Total). The dollar amount you want is always the last column.
3. VALIDATION: After extracting all line items, verify that your individual amounts sum to the Patient Subtotal or Invoice Total shown on the bill. If they don't match, re-read the bill carefully and correct the amounts.
4. Watch for items with high quantities but low/zero totals (e.g., 'Fluid - Lactated Ringers, per cc' with Quantity: 100.00 and Total: $0.00). The total is $0.00, not $100.00.
5. Watch for items where quantity includes decimals (e.g., 1.18) — this is NOT a dollar amount, it's a quantity multiplied by a unit price to get the total.

STEP 3 — EXTRACT POLICY DETAILS (if documents available):
- Identify the insurance company BRAND NAME (see Step 1 about consumer-facing names)
- Find the reimbursement rate (e.g., 70%, 80%, 90%)
- Find the annual deductible amount
- Find the annual limit (if any)
- Determine if exam fees are covered
- Determine the reimbursement math order by reading the policy's definition of "deductible":
  If the policy says the deductible is applied AFTER coinsurance/your share (e.g., Healthy Paws Section V.9: "the amount you must first pay after your pet's coinsurance portion has been applied"), set mathOrder to "coinsurance-first".
  Otherwise set mathOrder to "deductible-first" (most policies use this).
  - coinsurance-first: (coveredAmount × reimbursementRate) − deductible
  - deductible-first: (coveredAmount − deductible) × reimbursementRate
- Look for filing deadline requirements

If the uploaded documents include a "Pet Health Policy Changes" or endorsement document, it may contain updated or added parameters (deductible, reimbursement rate, coinsurance) for a specific pet that OVERRIDE the original declarations page. Always match the pet name on the vet bill to the correct pet in ALL uploaded policy documents. Use the most specific and most recent document for that pet's parameters. Do not assume all pets share the same deductible.

STEP 4 — DETERMINE COVERAGE FOR EACH LINE ITEM:
Only do this if you have enough policy info.

CRITICAL COVERAGE LOGIC: Pet insurance works on an EXCLUSION basis. Everything that qualifies as medically necessary veterinary treatment IS COVERED unless it falls under a specific exclusion in the policy. When determining coverage for each line item:
1. First check if the item matches ANY exclusion (exam fees, preventive care, pre-existing conditions, etc.)
2. If it matches an exclusion → mark as EXCLUDED with the specific policy section
3. If it does NOT match any exclusion AND it is a medically necessary veterinary service (diagnostics, medication, surgery, hospitalization, lab tests, x-rays, supplies, nursing care) → mark as COVERED, citing the policy's insuring agreement
4. If you genuinely cannot determine the category → mark as UNKNOWN
5. Default should be COVERED, not UNKNOWN. Most legitimate vet charges for illness/injury treatment are covered.

CONTEXTUAL COVERAGE RULES:
Some line items do not have independent coverage status — their coverage depends on the PURPOSE they were performed for. Apply these rules:

6. "Pre-op" or "pre-surgical" items (bloodwork, exams, consults) inherit the coverage status of the surgery they support. If the surgery is for a covered condition (illness/accident), the pre-op work is covered. If the surgery is excluded (e.g., spay/neuter, elective, cosmetic), the pre-op work is ALSO excluded. Look for clues: patient age, appointment context, item descriptions containing "pre-op", "pre-surgical", or "pre-anesthetic".

7. "Post-op" items (medications, follow-ups, rechecks) similarly inherit coverage from the original procedure.

8. If a line item says "pre-op" but the bill does not explicitly state what surgery it's for, look for contextual clues (rule 9). If 2 or more clues are present, mark as EXCLUDED with reason explaining the likely procedure. If no clues are present, mark as UNKNOWN with reason: "Pre-op work is only covered if the associated surgery is for a covered illness or accident. Coverage cannot be determined without knowing the surgery type."

9. Common contextual clues for spay/neuter pre-op: young pet age (under 1-2 years), "pre-op blood panel" as only item, no illness or injury noted on the bill, scheduled surgery appointment the following day.

10. RADIOLOGY AND SPECIALIST READS: Line items for radiologist interpretation, radiologist consultation, or specialist reads of diagnostic images (X-rays, ultrasounds, MRIs, CT scans) are part of the DIAGNOSTIC workup, NOT veterinary examination fees. These should be classified under diagnostic tests (e.g., Healthy Paws Section V.31.b) and marked as COVERED. Do not confuse the word "consultation" in a radiology context with a veterinary examination/consultation fee. Veterinary examination fees refer to the physical exam performed by the treating veterinarian, not specialist interpretation of diagnostic results.

11. CARRIER-SPECIFIC EXCLUSIONS: Do NOT apply carrier-specific exclusions universally. Each analysis must use ONLY the exclusions explicitly listed in the uploaded policy documents. For example, Healthy Paws excludes "veterinary examination fees" but Pumpkin explicitly covers examinations under Accident Benefits. If the policy's covered benefits section lists examinations, consultations, or similar terms, exam fees are COVERED — not excluded. Always check the uploaded policy's own exclusions list and covered benefits list independently. Never assume an exclusion exists unless you can cite the specific section and language from the provided documents.

12. VISIT TYPE CLASSIFICATION (apply before all exam fee decisions):
Before evaluating whether an exam fee is covered, classify the visit as either a WELLNESS VISIT or a SICK/INJURY VISIT based on the overall composition of the bill.
A visit is a WELLNESS VISIT if the majority of line items are routine or preventive in nature, including but not limited to: vaccinations, microchipping, fecal/parasite screening, heartworm testing, dental cleanings, nail trims, or any combination of routine care items explicitly excluded under the policy.
A visit is a SICK/INJURY VISIT if the primary reason for the visit is to diagnose or treat an illness or injury — meaning most line items are diagnostic tests, medications, treatments, or procedures addressing a specific medical condition.
EXAM FEE RULE:
- If WELLNESS VISIT → exam fee is EXCLUDED, even if the policy declarations list "Office Visits/Exam Fee: Yes". The declarations coverage applies only to exams required to diagnose or treat an illness or injury.
- If SICK/INJURY VISIT → exam fee follows normal policy coverage rules.
Add the determined visit type to the exclusionWarnings array in the JSON output (e.g., "Visit classified as WELLNESS VISIT — exam fee excluded regardless of declarations coverage" or "Visit classified as SICK/INJURY VISIT — exam fee follows policy coverage rules").

Common exclusions to check:
- Exam fees / office visit fees (often excluded)
- Pre-existing conditions
- Wellness / preventive care (vaccines, heartworm, flea/tick)
- Breeding-related costs
- Cosmetic procedures
- Dental cleaning (unless accident-related)
- Food, supplements, vitamins
- Boarding, grooming, training

For excluded items, cite the policy section. For covered items, cite the insuring agreement (e.g., "Covered — Section V.31.b: Laboratory and diagnostic tests").

For EACH line item, also include a "sourceQuote" field containing the verbatim or near-verbatim quote from the policy document that supports the coverage decision. Examples:
- Excluded item: "We do not cover: a. Veterinary examination fees."
- Covered item: "Veterinary Treatment means: b. Laboratory and diagnostic tests"
If no policy document is available or the specific text cannot be identified, set sourceQuote to null.

STEP 5 — CALCULATE REIMBURSEMENT:
- totalCovered = sum of all COVERED line items
- totalExcluded = sum of all EXCLUDED line items
- maxReimbursement = totalCovered × reimbursementRate (as a decimal, e.g. 80% = 0.80)
- This represents what the user would receive IF their annual deductible is fully met
- maxReimbursement must ALWAYS be a positive number when there are covered charges. Never return 0 when totalCovered > 0.

STEP 6 — FILING RECOMMENDATION:
CRITICAL: Almost ALWAYS recommend filing. Here's why:
- Even if covered charges are less than the deductible, filing applies those charges toward the annual deductible
- Every filed claim brings the user closer to receiving reimbursement checks
- Skipping a claim means losing deductible progress — that's leaving money on the table

Set shouldFile to true unless totalCovered is literally $0.
If totalCovered is $0.00 and all items are excluded or unknown, shouldFile should be false.
For shouldFileReason:
- If totalCovered > 0: "Yes — filing this claim applies $[totalCovered] toward your annual deductible, bringing you closer to the point where you start receiving reimbursement. Never skip a claim."
- If totalCovered is 0: "This bill consists entirely of excluded charges, so there's nothing eligible to file."

Return valid JSON matching this schema:
{
  "completeness": "full" | "partial" | "bill_only",
  "missingInfo": [string],
  "missingDocumentHint": string | null,
  "petInfo": {
    "name": string | null,
    "species": string | null,
    "breed": string | null
  },
  "billInfo": {
    "clinic": string,
    "date": string,
    "lineItems": [
      {
        "description": string,
        "amount": number,
        "covered": boolean | null,
        "reason": string,
        "sourceQuote": string | null
      }
    ],
    "total": number
  },
  "policyInfo": {
    "insurer": string | null,
    "reimbursementRate": number | null,
    "annualDeductible": number | null,
    "annualLimit": number | null,
    "examFeesCovered": boolean | null,
    "mathOrder": "reimbursement-first" | "deductible-first" | null,
    "filingDeadline": string | null
  },
  "analysis": {
    "totalBill": number,
    "totalExcluded": number,
    "totalCovered": number,
    "maxReimbursement": number,
    "shouldFile": boolean,
    "shouldFileReason": string,
    "exclusionWarnings": [string]
  }
}

IMPORTANT:
- For "reason" on line items: Use "Covered — [category]" or "Excluded — [Policy Section]: [reason]" or "Uncertain — [reason]"
- For "sourceQuote" on line items: Include the verbatim policy text supporting the coverage decision, or null if unavailable
- For amounts, use numbers not strings (150.00 not "$150.00")
- For reimbursementRate, use the percentage number (80 not 0.80)
- If completeness is "partial" or "bill_only", set covered to null for line items
- NEVER use the underwriter/parent company name as the insurer
- Double-check line item amounts match the invoice exactly
- Return ONLY the JSON object`

        // ============================================================
        // STAGE 1 — EXTRACTION AND VISIT CLASSIFICATION
        // Input: vet bill only. Output: line items, visit type, pet/clinic info.
        // ============================================================

        const extractionPrompt = `You are a veterinary invoice parser. Your ONLY job is to extract data from the attached vet bill and classify the visit type. Do not perform any insurance coverage analysis.

EXTRACTION RULES:
1. Use ONLY the TOTAL column (rightmost dollar amount) for each line item — never the Quantity or Unit Price columns.
2. Vet bill columns are typically: Description | Quantity | Total. The dollar amount is always the last column.
3. VALIDATION: Your line item amounts must sum to the invoice total shown on the bill. If they do not match, re-read and correct.
4. Items with $0.00 totals should still be listed with amount: 0.
5. Watch for quantity values that look like prices (e.g., Quantity: 100.00 with Total: $0.00 — the amount is 0, not 100).
6. Watch for quantities with decimals (e.g., 1.18) — this is a quantity multiplied by unit price, NOT a dollar amount.

VET BILL TEXT BACKUP (may be incomplete — always prefer the attached document):
${vetBillTextBackup.join('\n\n') || '(No text backup available)'}

VISIT TYPE CLASSIFICATION:
Classify the visit as WELLNESS_VISIT or SICK_INJURY_VISIT based on the PRIMARY purpose of the visit.

WELLNESS_VISIT — majority of items are routine or preventive:
- Vaccinations (DHPP, rabies, bordetella, leptospirosis, etc.)
- Annual wellness exam with no illness noted
- Microchipping
- Fecal/parasite screening
- Heartworm testing
- Dental cleaning (routine, not accident-related)
- Nail trim, ear cleaning, anal gland expression

SICK_INJURY_VISIT — primary purpose is diagnosing or treating illness or injury:
- Diagnostic tests for specific symptoms (bloodwork, x-rays, urinalysis for a condition)
- Medications prescribed for a condition
- Treatments (IV fluids, wound care, sutures)
- Surgery for illness or injury
- Emergency care
- Follow-up for ongoing condition

MIXED VISITS: Classify by PRIMARY purpose. If a sick pet also gets a vaccine during the visit, it is still a SICK_INJURY_VISIT if the main reason was illness treatment.

LINE ITEM CATEGORIES — assign one per item:
- "vaccination" — any vaccine
- "exam" — office visit fee, exam fee, consultation fee
- "diagnostic" — bloodwork, urinalysis, x-ray, ultrasound, lab tests, cultures
- "medication" — prescriptions, injections, topicals
- "surgery" — surgical procedures, anesthesia, surgery supplies
- "preventive" — heartworm test, fecal, microchip, dental cleaning, nail trim
- "cosmetic" — elective cosmetic procedures
- "other" — anything that does not fit above

Return ONLY this JSON object:
{
  "visitType": "WELLNESS_VISIT" | "SICK_INJURY_VISIT",
  "visitTypeReason": "brief explanation of classification",
  "petInfo": {
    "name": string | null,
    "species": string | null,
    "breed": string | null
  },
  "clinicInfo": {
    "name": string | null,
    "date": string | null
  },
  "totalBill": number,
  "lineItems": [
    {
      "description": string,
      "amount": number,
      "category": "vaccination" | "exam" | "diagnostic" | "medication" | "surgery" | "preventive" | "cosmetic" | "other"
    }
  ]
}`

        console.log('[analyze-claim] Stage 1: Extracting vet bill + classifying visit type...', {
          vetBillFiles: vetBillFileContents.length
        })

        const stage1Completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a veterinary invoice parser. Extract data accurately and return valid JSON only.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: extractionPrompt },
                ...vetBillFileContents
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        })

        const stage1Content = stage1Completion.choices?.[0]?.message?.content ?? ''

        // Parse Stage 1 response
        let stage1Result = null
        try {
          let cleaned = stage1Content.trim()
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
          }
          stage1Result = JSON.parse(cleaned)
        } catch {
          const match = stage1Content.match(/\{[\s\S]*\}/)
          if (match) {
            try { stage1Result = JSON.parse(match[0]) } catch {}
          }
        }

        if (!stage1Result) {
          console.error('[analyze-claim] Stage 1 failed to parse:', stage1Content.substring(0, 500))
          return res.status(422).json({
            ok: false,
            error: 'Failed to extract vet bill data. Please try again.',
            raw: stage1Content.substring(0, 1000)
          })
        }

        console.log('[analyze-claim] Stage 1 complete:', {
          visitType: stage1Result.visitType,
          visitTypeReason: stage1Result.visitTypeReason,
          petName: stage1Result.petInfo?.name,
          lineItemCount: stage1Result.lineItems?.length,
          totalBill: stage1Result.totalBill
        })

        // ============================================================
        // STAGE 2 — COVERAGE ANALYSIS
        // Input: Stage 1 JSON (visit type is immutable) + policy docs.
        // Output: coverage decisions, reimbursement, filing recommendation.
        // ============================================================

        const coveragePrompt = `You are a pet insurance coverage analyst. A structured extraction of the vet bill has already been completed in Stage 1. Your job is ONLY to determine coverage and calculate reimbursement. Do not re-extract line items or re-classify the visit type.

STAGE 1 EXTRACTION (treat as ground truth — do not modify):
${JSON.stringify(stage1Result, null, 2)}

THE VISIT TYPE IS: ${stage1Result.visitType}
This is FINAL and IMMUTABLE. Do not reconsider it under any circumstances.

Policy documents are attached. Examine each one carefully.

POLICY TEXT BACKUP (may be incomplete — always prefer attached documents):
${policyTextBackup.join('\n\n') || '(No policy documents uploaded)'}

DOCUMENT IDENTIFICATION:
- Declarations page (usually 1 page): reimbursement rate, deductible, annual limit, pet schedule
- Policy documents: coverage details, exclusions, terms
- Endorsements/changes: may OVERRIDE declarations for a specific pet — match pet name, use most recent/specific document

UNDERWRITER-TO-BRAND MAPPINGS (always use the brand name, never the underwriter):
- "Westchester Fire Insurance Company" = "Healthy Paws"
- "United States Fire Insurance Company" = "Pumpkin"
- "American Pet Insurance Company" = "Fetch"
- "Independence American Insurance Company" = "Figo"
- "National Casualty Company" = "Nationwide Pet Insurance"

STEP A — ASSESS COMPLETENESS:
- "full": vet bill + enough policy info for complete analysis
- "partial": vet bill + some policy info but missing key details
- "bill_only": no usable policy documents uploaded
If partial, populate missingInfo[] with user-friendly descriptions:
- "Your reimbursement rate (the percentage your insurer pays back, usually 70%, 80%, or 90%)"
- "Your annual deductible amount"
- "Your policy's exclusion list (to determine which charges are covered)"
Include missingDocumentHint: e.g., "Look for an email from Healthy Paws with your 'declarations page' — it shows your deductible, reimbursement rate, and limits."

STEP B — EXTRACT POLICY PARAMETERS FROM THE DECLARATIONS PAGE:
The declarations page is typically a 1-page summary with a header block or table containing specific labeled fields. Find and extract each one exactly as written — do NOT guess or invent values. If a field is not clearly present, return null.

REIMBURSEMENT RATE (the percentage the insurer pays you back):
- Look for a field labeled: "Co-Insurance", "Coinsurance", "Coinsurance %", "Reimbursement Rate", "Insurer Pays", or "Reimbursement %"
- CRITICAL TERMINOLOGY: When the declarations page uses "Co-Insurance" and shows a percentage (e.g., "Co-Insurance: 70%"), that percentage IS the amount the insurer reimburses to you. Return 70, not 30. Co-Insurance on a declarations page represents the insurer's share of covered costs, not the policyholder's out-of-pocket share.
- Return as a plain integer: 70 means 70% reimbursement. Do NOT return 0.70.
- If you cannot find this field with confidence, return null. Do NOT default to 80 or any other value.

ANNUAL DEDUCTIBLE:
- Look for a field labeled: "Annual Deductible", "Deductible", "Per Policy Period Deductible", or "Yearly Deductible"
- This is the dollar amount the policyholder pays per year BEFORE insurance starts reimbursing
- Do NOT confuse with per-incident deductibles, per-condition deductibles, waiting periods, or copay amounts
- Return as a plain number: 500 means $500 deductible
- If you cannot find this field with confidence, return null. Do NOT default to 100 or any other value.

ANNUAL LIMIT:
- Look for a field labeled: "Annual Limit", "Policy Maximum", "Annual Maximum", "Annual Benefit Limit", or "Maximum Annual Benefit"
- Return as a plain number: 10000 means $10,000 annual limit
- If you cannot find this field, return null.

CARRIER BRAND NAME:
- Use consumer-facing brand name, not underwriter (see mappings above)

MATH ORDER:
- Look for a WORKED EXAMPLE in the policy — a section showing how reimbursement is calculated step-by-step.
  Example of what to look for: "We pay [90%] of your approved claim ($2,000 x [90%] = [$1,800]). We deduct [$100] from your payment..."
- Read the ORDER OF OPERATIONS in that example:
  → If the percentage is applied FIRST (multiply covered amount by rate), then the deductible is subtracted → return "reimbursement-first"
  → If the deductible is subtracted FIRST, then the percentage is applied → return "deductible-first"
- Also check the policy's definition of "deductible":
  → If it says the deductible applies AFTER your coinsurance/percentage share (e.g., "the amount you must first pay after your pet's coinsurance portion has been applied") → return "reimbursement-first"
- Do NOT guess. If you cannot find a worked example or a clear definition → return null.

FILING DEADLINE:
- Look for "filing deadline", "claim submission deadline", or "days to file a claim"
- Return as a string (e.g., "90 days from date of service") or null if not found

POLICY PET NAME:
- Look for the insured pet's name on the declarations page (fields like "Pet Schedule", "Covered Pet", "Insured Pet", "Pet Name", or a pet schedule table)
- Return the name exactly as written, or null if not found

POLICY EFFECTIVE DATE:
- Look for "Effective Date", "Policy Start Date", "Coverage Begins", "Policy Period From", or "Inception Date"
- Return in YYYY-MM-DD format, or null if not found

STEP C — DETERMINE COVERAGE FOR EACH LINE ITEM:
Apply these rules in ORDER. Do not skip any rule.

RULE 1 — EXAM FEE RULE (apply FIRST, before anything else):
The visit type from Stage 1 is "${stage1Result.visitType}".
- WELLNESS_VISIT → any exam fee, office visit fee, or consultation fee is EXCLUDED regardless of what the policy declarations say. Reason: "Excluded — Wellness visit: exam fees are only covered for sick/injury visits, not routine checkups"
- SICK_INJURY_VISIT → exam fee follows carrier-specific rules (RULE 3)

RULE 2 — WELLNESS/PREVENTIVE EXCLUSION:
Items categorized as "vaccination" or "preventive" in the Stage 1 lineItems are EXCLUDED. These are not covered by accident/illness policies regardless of carrier.

RULE 3 — CARRIER-SPECIFIC RULES (uploaded policy documents only — never assume):
Use ONLY the exclusions explicitly listed in the attached policy. Read both the covered benefits section AND the exclusions list.
- If you see Healthy Paws policy: exam fees are ALWAYS EXCLUDED. Cite the policy's blanket exclusion as the reason — use: "Excluded — Healthy Paws policy: veterinary examination fees are explicitly excluded under the policy's blanket exclusion." Do NOT cite RULE 1 wellness visit classification as the reason; the exclusion applies regardless of visit type.
- If you see Pumpkin policy: exam fees ARE covered for sick/injury visits (look for examinations in covered benefits)
- Apply all other carrier-specific exclusions found in the uploaded documents

RULE 4 — PRE-OP/POST-OP INHERITANCE:
Pre-op items (bloodwork, exams, prep described as "pre-op", "pre-surgical", "pre-anesthetic"):
- If the surgery is for a covered condition (illness/injury) → COVERED
- If the surgery is excluded (spay/neuter, elective, cosmetic) → EXCLUDED
- If surgery type is unknown but 2+ contextual clues suggest spay/neuter (pet under 1-2 years, "pre-op blood panel" as only item, no illness noted) → EXCLUDED with explanation
- If surgery type genuinely unknown → UNKNOWN: "Pre-op work is only covered if the associated surgery is for a covered illness or accident. Surgery type cannot be determined from this bill."
Post-op items (medications, follow-ups, rechecks) inherit coverage from the original procedure.

RULE 5 — RADIOLOGY/SPECIALIST READS:
Radiologist reads, radiologist consultations, and specialist interpretation of diagnostic images (x-ray, ultrasound, MRI, CT) are DIAGNOSTIC TESTS — not exam fees. Mark as COVERED citing diagnostic test coverage. Do not confuse specialist reads with veterinary exam fees.

RULE 6 — DEFAULT RULE:
Pet insurance covers on an EXCLUSION basis. Everything medically necessary IS covered unless explicitly excluded.
Diagnostics, medications, surgery, hospitalization, lab tests, x-rays, supplies, nursing care → COVERED by default.
Default to COVERED, not UNKNOWN, for legitimate illness/injury treatment items.

For each line item from Stage 1, provide:
- "covered": true (covered) | false (excluded) | null (unknown/no policy)
- "reason": "Covered — [category/section]" or "Excluded — [specific reason]" or "Uncertain — [reason]"
- "sourceQuote": verbatim or near-verbatim policy text supporting the decision, or null if unavailable
- "section": policy section reference (e.g., "Section V.31.b") or null

STEP D — CALCULATE REIMBURSEMENT:
- totalCovered = sum of all covered line item amounts
- totalExcluded = sum of all excluded line item amounts
- maxReimbursement = totalCovered × (reimbursementRate / 100)
- maxReimbursement must ALWAYS be a positive number when totalCovered > 0. Never return 0 when covered charges exist.

STEP E — FILING RECOMMENDATION:
Almost always shouldFile: true. Even sub-deductible claims build annual deductible progress.
- shouldFile: true if totalCovered > 0
- shouldFile: false ONLY if totalCovered === 0
- shouldFileReason if true: "Yes — filing this claim applies $[totalCovered formatted as dollar amount] toward your annual deductible, bringing you closer to the point where you start receiving reimbursement. Never skip a claim."
- shouldFileReason if false: "This bill consists entirely of excluded charges, so there is nothing eligible to file."

STEP F — CONFIDENCE LEVEL:
- "High": full policy documents with clear exclusions list and declarations page
- "Medium": partial policy info or declarations page only
- "Low": bill only or very limited policy info

STEP G — ELIGIBILITY FLAGS:
Review both documents for any eligibility concerns and populate eligibilityWarnings accordingly:
- If the vet bill service date is BEFORE the policy effective date: add "Service date ([date]) predates policy effective date ([date]) — this visit may not be covered."
- If the service date is within the carrier's standard waiting period (typically 14–15 days) after the policy start date: add "Service date is within the initial waiting period ([N] days after policy start on [date]) — illness claims may not be covered."
- If a pet name appears on the policy and it does NOT match the pet name on the vet bill: add "Pet name mismatch: bill is for '[billName]' but the policy covers '[policyName]'."
- If no concerns exist, return an empty array.

Return ONLY this JSON object:
{
  "completeness": "full" | "partial" | "bill_only",
  "missingInfo": [],
  "missingDocumentHint": null,
  "policyInfo": {
    "carrier": string | null,
    "reimbursementRate": number | null,
    "deductible": number | null,
    "annualLimit": number | null,
    "mathOrder": "reimbursement-first" | "deductible-first" | null,
    "filingDeadline": string | null,
    "policyPetName": string | null,
    "policyEffectiveDate": string | null
  },
  "analysis": {
    "visitType": string,
    "visitTypeReason": string,
    "lineItems": [
      {
        "description": string,
        "amount": number,
        "covered": true | false | null,
        "reason": string,
        "sourceQuote": string | null,
        "section": string | null
      }
    ],
    "totalBill": number,
    "totalCovered": number,
    "totalExcluded": number,
    "maxReimbursement": number,
    "shouldFile": boolean,
    "shouldFileReason": string,
    "exclusionWarnings": [],
    "confidenceLevel": "High" | "Medium" | "Low",
    "eligibilityWarnings": []
  }
}

IMPORTANT:
- Use numbers not strings for amounts (150.00 not "$150.00")
- reimbursementRate must be an integer (80 not 0.80)
- NEVER use the underwriter name as the carrier
- Return ONLY the JSON object`

        console.log('[analyze-claim] Stage 2: Running coverage analysis...', {
          policyFiles: policyFileContents.length,
          visitType: stage1Result.visitType
        })

        const stage2Completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a pet insurance coverage analyst. Provide accurate, conservative analysis. Always return valid JSON.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: coveragePrompt },
                ...policyFileContents
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        })

        const stage2Content = stage2Completion.choices?.[0]?.message?.content ?? ''

        // Parse Stage 2 response
        let stage2Result = null
        try {
          let cleaned = stage2Content.trim()
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
          }
          stage2Result = JSON.parse(cleaned)
        } catch {
          const match = stage2Content.match(/\{[\s\S]*\}/)
          if (match) {
            try { stage2Result = JSON.parse(match[0]) } catch {}
          }
        }

        if (!stage2Result) {
          console.error('[analyze-claim] Stage 2 failed to parse:', stage2Content.substring(0, 500))
          return res.status(422).json({
            ok: false,
            error: 'Failed to analyze coverage. Please try again.',
            raw: stage2Content.substring(0, 1000)
          })
        }

        console.log('[analyze-claim] Stage 2 complete:', {
          completeness: stage2Result.completeness,
          carrier: stage2Result.policyInfo?.carrier,
          totalCovered: stage2Result.analysis?.totalCovered,
          lineItemCount: stage2Result.analysis?.lineItems?.length
        })

        // ============================================================
        // MERGE STAGE 1 + STAGE 2 INTO FINAL RESPONSE
        // Shape must match the original single-stage response exactly so
        // no frontend changes are needed.
        // ============================================================

        const s2analysis = stage2Result.analysis || {}
        const s2policy = stage2Result.policyInfo || {}

        const analysis = {
          completeness: stage2Result.completeness,
          missingInfo: stage2Result.missingInfo || [],
          missingDocumentHint: stage2Result.missingDocumentHint || null,
          // petInfo and billInfo come from Stage 1
          petInfo: stage1Result.petInfo || { name: null, species: null, breed: null },
          billInfo: {
            clinic: stage1Result.clinicInfo?.name || null,
            date: stage1Result.clinicInfo?.date || null,
            lineItems: s2analysis.lineItems || [],
            total: stage1Result.totalBill || 0
          },
          // policyInfo from Stage 2 — map field names to original shape
          policyInfo: {
            insurer: s2policy.carrier || null,
            reimbursementRate: s2policy.reimbursementRate || null,
            annualDeductible: s2policy.deductible || null,
            annualLimit: s2policy.annualLimit || null,
            examFeesCovered: null, // determined by Stage 2 logic, not surfaced separately
            mathOrder: s2policy.mathOrder || null,
            filingDeadline: s2policy.filingDeadline || null
          },
          analysis: {
            totalBill: s2analysis.totalBill || stage1Result.totalBill || 0,
            totalExcluded: s2analysis.totalExcluded || 0,
            totalCovered: s2analysis.totalCovered || 0,
            maxReimbursement: s2analysis.maxReimbursement || 0,
            shouldFile: s2analysis.shouldFile ?? false,
            shouldFileReason: s2analysis.shouldFileReason || '',
            exclusionWarnings: s2analysis.exclusionWarnings || []
          }
        }

        // Server-side reimbursement recalculation using mathOrder.
        // We always recalculate here so the correct formula is enforced regardless of what the AI computed.
        // Only runs when we have covered charges AND a real reimbursement rate — never silently defaults.
        if (analysis.analysis.totalCovered > 0 && analysis.policyInfo.reimbursementRate) {
          const covered = analysis.analysis.totalCovered
          const rate = analysis.policyInfo.reimbursementRate / 100
          const deductible = analysis.policyInfo.annualDeductible || 0
          // Default to "reimbursement-first" when mathOrder is null — this is the modern standard
          // (e.g., Odie Section 4A: multiply by rate first, then subtract deductible)
          const order = analysis.policyInfo.mathOrder || 'reimbursement-first'

          let reimbursement
          if (order === 'deductible-first') {
            // (covered − deductible) × rate
            reimbursement = (covered - deductible) * rate
          } else {
            // reimbursement-first: (covered × rate) − deductible
            reimbursement = (covered * rate) - deductible
          }

          analysis.analysis.maxReimbursement = Math.round(Math.max(0, reimbursement) * 100) / 100
        }

        // Backwards compatibility: add old field name for older frontends
        analysis.analysis.reimbursementBeforeDeductible = analysis.analysis.maxReimbursement

        // ============================================================
        // ELIGIBILITY PRE-CHECKS (skipped when crossTestingMode=true)
        // Uses data extracted from both uploaded documents:
        //   - billPetName: from Stage 1 vet bill parsing
        //   - policyPetName: from Stage 2 policy document parsing
        //   - serviceDate / policyEffectiveDate: same sources
        // ============================================================
        // Seed with any warnings the AI detected in STEP G, then append programmatic checks
        const eligibilityWarnings = Array.isArray(s2analysis.eligibilityWarnings) ? [...s2analysis.eligibilityWarnings] : []
        if (!crossTestingMode) {
          const billPetName = stage1Result.petInfo?.name
          const policyPetName = s2policy.policyPetName
          if (billPetName && policyPetName) {
            if (billPetName.trim().toLowerCase() !== policyPetName.trim().toLowerCase()) {
              eligibilityWarnings.push(`Pet name mismatch: the vet bill is for "${billPetName}" but the policy is for "${policyPetName}".`)
            }
          }

          const serviceDate = stage1Result.clinicInfo?.date       // YYYY-MM-DD from Stage 1
          const effectiveDate = s2policy.policyEffectiveDate       // YYYY-MM-DD from Stage 2
          if (serviceDate && effectiveDate) {
            // Use noon UTC to avoid any date-boundary DST shifts
            const svcMs = new Date(serviceDate + 'T12:00:00Z').getTime()
            const effMs = new Date(effectiveDate + 'T12:00:00Z').getTime()
            const daysDiff = Math.floor((svcMs - effMs) / (1000 * 60 * 60 * 24))
            if (daysDiff < 0) {
              eligibilityWarnings.push(`Service date (${serviceDate}) is before the policy effective date (${effectiveDate}). This visit may not be eligible for coverage.`)
            } else if (daysDiff < 15) {
              eligibilityWarnings.push(`Service date is within the 15-day waiting period (${daysDiff} day${daysDiff === 1 ? '' : 's'} after policy start on ${effectiveDate}). Illness claims may not be covered.`)
            }
          }
        }
        analysis.eligibilityWarnings = eligibilityWarnings.length ? eligibilityWarnings : null

        console.log('[analyze-claim] ✅ Two-stage analysis complete:', {
          visitType: stage1Result.visitType,
          insurer: analysis.policyInfo?.insurer,
          totalBill: analysis.billInfo?.total,
          totalCovered: analysis.analysis?.totalCovered,
          lineItemCount: analysis.billInfo?.lineItems?.length
        })

        // Clean up file buffers (help GC)
        if (vetBillFile) vetBillFile.buffer = null
        for (const docFile of insuranceDocsFiles) {
          if (docFile) docFile.buffer = null
        }

        return res.json({ ok: true, data: analysis })

      } catch (error) {
        console.error('[analyze-claim] Error:', error)

        // Handle OpenAI timeout
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
          return res.status(504).json({
            ok: false,
            error: 'Analysis timed out. Please try with smaller files or fewer documents.'
          })
        }

        // Handle OpenAI rate limits
        if (error.status === 429) {
          return res.status(429).json({
            ok: false,
            error: 'Service is busy. Please try again in a few moments.'
          })
        }

        return res.status(500).json({
          ok: false,
          error: error.message || 'An unexpected error occurred during analysis.'
        })
      }
    })
  })

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`)
  })
}

startServer()