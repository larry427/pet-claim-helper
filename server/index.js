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
import crypto from 'crypto'

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
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    // Preserve raw body buffer for Svix webhook signature verification
    req.rawBody = buf
  }
}))

// ── File validation helper (magic bytes + size) ──
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const validateFileBuffer = (buffer, filename) => {
  if (!buffer || buffer.length === 0) return { valid: false, reason: 'empty', message: 'File is empty.' }
  if (buffer.length > MAX_FILE_SIZE) return { valid: false, reason: 'size', message: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum file size is 10MB.` }
  // Magic bytes check
  const isPdf = buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-'
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
  const isPng = buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
  if (!isPdf && !isJpeg && !isPng) return { valid: false, reason: 'format', message: 'Unsupported file format. Please upload a PDF or image file (JPG, PNG).' }
  const detectedType = isPdf ? 'pdf' : isJpeg ? 'jpeg' : 'png'
  return { valid: true, detectedType }
}

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
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

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
      // Validate file format and size
      const fileCheck = validateFileBuffer(file.buffer, file.originalname)
      if (!fileCheck.valid) {
        console.log(`[extract-pdf] Rejected ${file.originalname} — ${fileCheck.reason}: ${fileCheck.message}`)
        return res.status(fileCheck.reason === 'size' ? 413 : 400).json({ ok: false, error: fileCheck.message })
      }
      // eslint-disable-next-line no-console
      console.log('[extract-pdf] upload info', { mimetype: file.mimetype, size: file.buffer?.length, detected: fileCheck.detectedType })
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
      // Validate file format and size
      const fileCheck = validateFileBuffer(file.buffer, file.originalname)
      if (!fileCheck.valid) {
        console.log(`[extract-receipt] Rejected ${file.originalname} — ${fileCheck.reason}: ${fileCheck.message}`)
        return res.status(fileCheck.reason === 'size' ? 413 : 400).json({ ok: false, error: fileCheck.message })
      }
      console.log('[extract-receipt] upload info', { mimetype: file.mimetype, size: file.buffer?.length, detected: fileCheck.detectedType })

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

SURGERY VISIT CLASSIFICATION RULES:
When the visit_type is "surgery" or the bill clearly describes a surgical procedure:

10. The following items are ALWAYS COVERED on surgery visits unless the SURGERY ITSELF is excluded (e.g., spay/neuter, cosmetic, elective, pre-existing condition). These are standard components of any surgical procedure and are never independently "not medically necessary" when the surgery is covered:
    - General Anesthesia / Anesthesia
    - Surgical Monitoring / Anesthesia Monitoring / Vital Signs Monitoring
    - IV Catheter / IV Fluids / Fluid Therapy
    - Surgical Pack / Surgical Supplies / Sterile Supplies
    - Pain Management / Post-Op Pain Medication / Injectable Pain Medication
    - Sutures / Wound Closure
    - E-Collar / Cone
    - Pre-Surgical Bloodwork (when associated with a covered surgery)
    - Hospital/Boarding fees on the day of surgery

11. Do NOT exclude any of the above items with reasons like "not medically necessary," "included in surgery fee," "bundled with procedure," or "routine monitoring." These are individually billable covered services when the underlying surgery is covered.

12. If the surgery itself is excluded (spay/neuter, elective, cosmetic, pre-existing condition), then ALL associated surgical items (anesthesia, monitoring, supplies, etc.) are ALSO excluded — they inherit the exclusion from the procedure per the contextual coverage rules above.

13. For surgery visits, the exam/consultation fee follows the carrier's specific rule (some carriers cover it, some exclude it). Do not change how exam fees are handled — only the surgical support items listed above.

14. RADIOLOGY AND SPECIALIST READS: Line items for radiologist interpretation, radiologist consultation, or specialist reads of diagnostic images (X-rays, ultrasounds, MRIs, CT scans) are part of the DIAGNOSTIC workup, NOT veterinary examination fees. These should be classified under diagnostic tests (e.g., Healthy Paws Section V.31.b) and marked as COVERED. Do not confuse the word "consultation" in a radiology context with a veterinary examination/consultation fee. Veterinary examination fees refer to the physical exam performed by the treating veterinarian, not specialist interpretation of diagnostic results.

15. CARRIER-SPECIFIC EXCLUSIONS: Do NOT apply carrier-specific exclusions universally. Each analysis must use ONLY the exclusions explicitly listed in the uploaded policy documents. For example, Healthy Paws excludes "veterinary examination fees" but Pumpkin explicitly covers examinations under Accident Benefits. If the policy's covered benefits section lists examinations, consultations, or similar terms, exam fees are COVERED — not excluded. Always check the uploaded policy's own exclusions list and covered benefits list independently. Never assume an exclusion exists unless you can cite the specific section and language from the provided documents.

16. VISIT TYPE CLASSIFICATION (apply before all exam fee decisions):
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

For EACH line item, include a "sourceQuote" field — the VERBATIM quote (1-2 sentences, copied word-for-word) from the policy document that justifies the coverage decision. This is EQUALLY required for COVERED and EXCLUDED items:
- COVERED items: Find the language in the policy's insuring agreement, covered benefits section, or benefit provisions that explicitly covers this type of service. Example: "Veterinary Treatment means: b. Laboratory and diagnostic tests including but not limited to blood tests, urinalysis, and cultures."
- EXCLUDED items: Find the exclusion clause. Example: "We do not cover: a. Veterinary examination fees."
Search the policy thoroughly — covered benefits language exists for virtually every covered item. Set sourceQuote to null ONLY if no policy document was uploaded. NEVER return "" for a covered item when a policy document is present — the insuring agreement or definitions section always describes what is covered. NEVER fabricate — exact words from the policy only.

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
- For "sourceQuote" on line items: REQUIRED for BOTH covered and excluded items — find the verbatim policy language from the insuring agreement (for covered) or exclusions list (for excluded). Never return "" when a policy document is present
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

        const extractionPrompt = `You are a veterinary invoice parser. Your ONLY job is to extract data from the attached vet bill/invoice and classify the visit type. Do not perform any insurance coverage analysis.

CRITICAL — DOCUMENT SCOPE:
- You are reading a VET BILL or INVOICE only. Do NOT extract or infer any values from an insurance policy document.
- clinic_name must be the name of the veterinary clinic or animal hospital that provided services — NEVER an insurance company name (e.g., never "Westchester Fire Insurance Company", "Healthy Paws", "Pumpkin", etc.)
- visit_date must be the date services were rendered on the invoice — NEVER a policy effective date or expiration date
- If you cannot find a value with confidence, return null for that field — do NOT guess or pull from non-vet-bill content

EXTRACTION RULES:
1. Use ONLY the TOTAL column (rightmost dollar amount) for each line item — never the Quantity or Unit Price columns.
2. Vet bill columns are typically: Description | Quantity | Total. The dollar amount is always the last column.
3. VALIDATION: Your line item amounts must sum to the invoice total shown on the bill. If they do not match, re-read and correct.
4. Items with $0.00 totals should still be listed with amount: 0.
5. Watch for quantity values that look like prices (e.g., Quantity: 100.00 with Total: $0.00 — the amount is 0, not 100).
6. Watch for quantities with decimals (e.g., 1.18) — this is a quantity multiplied by unit price, NOT a dollar amount.

SERVICE DATE EXTRACTION (REQUIRED):
- Extract the date the pet was seen by the veterinarian. This is the visit/service date, NOT the invoice print date, payment date, or account statement date.
- Look for labels like "Date:", "Date of Service:", "Service Date:", "Visit Date:", "Exam Date:", or a date printed near the clinic header or near the line items.
- Return as clinicInfo.date in YYYY-MM-DD format (e.g., "2026-01-27").
- If multiple dates appear on the bill, use the earliest service/treatment date — not the payment or statement date.
- This field is REQUIRED — search the entire document thoroughly before returning null.

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

        // ── Post-Stage 1 validation: reject policy-document contamination ──
        const insurerNames = ['insurance', 'westchester', 'chubb', 'pumpkin', 'healthy paws', 'embrace', 'odie', 'fetch', 'figo', 'nationwide', 'trupanion', 'lemonade', 'spot', 'pets best']
        const rawClinic = stage1Result.clinicInfo?.name || ''
        if (rawClinic && insurerNames.some(n => rawClinic.toLowerCase().includes(n))) {
          console.warn(`[analyze-claim] ⚠ Stage 1 clinic_name rejected (looks like insurer): "${rawClinic}"`)
          stage1Result.clinicInfo.name = null
        }
        const rawDate = stage1Result.clinicInfo?.date || null
        if (rawDate) {
          const parsedDate = new Date(rawDate)
          const sixMonthsAgo = new Date()
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
          if (!isNaN(parsedDate.getTime()) && parsedDate < sixMonthsAgo) {
            console.warn(`[analyze-claim] ⚠ Stage 1 visit_date suspicious (>6mo old): "${rawDate}"`)
          }
        }
        if (!stage1Result.totalBill || stage1Result.totalBill === 0) {
          console.warn('[analyze-claim] ⚠ Stage 1 totalBill is null or 0')
        }

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
- Look for a field labeled: "Co-Insurance", "Coinsurance", "Coinsurance %", "Reimbursement Rate", "Insurer Pays", "Reimbursement %", or "Owner's Share"
- CRITICAL — CO-INSURANCE CONVERSION: In standard insurance terminology, "co-insurance" means the POLICYHOLDER'S share (what the owner pays), NOT the insurer's share. You MUST convert it:
  → "Co-Insurance: 10%" or "Coinsurance: 10%" or "Owner's Share: 10%" → the owner pays 10%, the insurer pays 90% → return reimbursementRate: 90
  → "Co-Insurance: 20%" → the owner pays 20%, the insurer pays 80% → return reimbursementRate: 80
  → "Co-Insurance: 30%" → the owner pays 30%, the insurer pays 70% → return reimbursementRate: 70
  This applies to ALL carriers (Nationwide, etc.) that use co-insurance/coinsurance/owner's share terminology.
- NO CONVERSION NEEDED for labels like "Reimbursement Rate", "Reimbursement %", "Insurer Pays", "We Pay" — these already represent the insurer's share. Use the value directly.
  → "Reimbursement Rate: 80%" → return reimbursementRate: 80
  → "Insurer Pays: 90%" → return reimbursementRate: 90
- Also return a new field "rateIsCoinsurance": true if you converted from co-insurance/coinsurance/owner's share terminology, false otherwise.
- Return as a plain integer: 90 means 90% reimbursement. Do NOT return 0.90.
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

RULE 5B — WASTE DISPOSAL EXCLUSION (apply on ALL visit types):
Medical Waste Disposal Fee, Hazardous Waste/Sharps Fee, Biohazard Disposal Fee, Sharps Disposal Fee, and any similar waste, sharps, or biohazard disposal charges are ALWAYS excluded. These are administrative clinic fees, not medical treatments, diagnostics, or medications. Exclude them on ALL visit types — wellness, sick, injury, surgery, and emergency. Reason: "Excluded — Administrative fee: waste/sharps disposal is a clinic operational cost, not a covered medical expense." Do NOT override this rule based on visit type or default coverage logic.

RULE 6 — DEFAULT RULE:
Pet insurance covers on an EXCLUSION basis. Everything medically necessary IS covered unless explicitly excluded.
Diagnostics, medications, surgery, hospitalization, lab tests, x-rays, supplies, nursing care → COVERED by default.
Default to COVERED, not UNKNOWN, for legitimate illness/injury treatment items.

RULE 7 — PRESCRIPTION DIET FOR COVERED CONDITIONS:
If a prescription diet or prescription pet food is prescribed by a veterinarian to treat a specific COVERED condition (e.g., post-surgical GI recovery diet after intestinal surgery, renal diet for diagnosed kidney disease), it IS covered. Only exclude prescription diets when they are for general health maintenance, weight loss, prevention, or when there is no underlying covered condition being treated. When a prescription diet appears on a bill alongside a covered surgery or covered illness treatment, default to COVERED unless the policy explicitly excludes ALL prescription foods with no exception for covered conditions. Pumpkin policy explicitly covers "Prescription pet food to treat a covered condition." Odie and most carriers follow similar logic.

RULE 8 — E-COLLAR / ELIZABETHAN COLLAR:
An Elizabethan collar (e-collar, cone) provided as part of post-surgical care or to prevent a pet from interfering with treatment of a covered condition is a MEDICAL SUPPLY, not a non-medical supply. It is functionally equivalent to bandages, casts, and splints — it protects a surgical site or wound. Mark as COVERED when prescribed or provided in connection with a covered procedure. Only exclude if the e-collar is sold as a standalone retail item unrelated to any covered treatment.

For each line item from Stage 1, provide:
- "covered": true (covered) | false (excluded) | null (unknown/no policy)
- "reason": "Covered — [category/section]" or "Excluded — [specific reason]" or "Uncertain — [reason]"
- "sourceQuote": REQUIRED for BOTH covered AND excluded items — not just exclusions. Extract the verbatim policy language (1-2 sentences max, copied word-for-word from the uploaded policy document) that justifies the coverage decision.
  FOR COVERED ITEMS: Search the insuring agreement, covered benefits section, definitions, or benefit provisions for language that explicitly covers this type of service. Look for definitions of "Veterinary Treatment", "Covered Veterinary Expenses", "Eligible Expenses", or benefit descriptions. Example: "We will pay covered veterinary expenses that you incur during the policy term for the diagnosis or treatment of your pet's condition." Another example: "Veterinary Treatment means: b. Laboratory and diagnostic tests including but not limited to blood tests, urinalysis, and cultures."
  FOR EXCLUDED ITEMS: Search the exclusions section. Example: "Examination fees, office visit charges, and consultation fees are not covered under this policy."
  The policy ALWAYS contains language describing what IS covered — the insuring agreement, covered benefits, or definitions section will have it. Return "" ONLY if no policy documents were uploaded. NEVER return "" for a covered item when a policy is present — find the applicable covered benefits language. NEVER fabricate or paraphrase — copy the exact words from the policy.
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
    "rateIsCoinsurance": boolean,
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

        // ── Co-insurance safety net ──
        // If GPT flagged the rate as co-insurance but forgot to convert, fix it server-side.
        // Co-insurance = owner's share, so reimbursement = 100 - coinsurance.
        // Also catch cases where GPT returned a suspiciously low rate (≤30%) with a co-insurance flag.
        if (s2policy.reimbursementRate != null && s2policy.rateIsCoinsurance === true) {
          const raw = s2policy.reimbursementRate
          if (raw <= 30) {
            // GPT likely returned the raw co-insurance value without converting — fix it
            s2policy.reimbursementRate = 100 - raw
            console.log(`[analyze-claim] Co-insurance safety net: converted ${raw}% co-insurance → ${s2policy.reimbursementRate}% reimbursement rate`)
          } else {
            // GPT already converted (e.g., returned 90 with rateIsCoinsurance: true) — no change needed
            console.log(`[analyze-claim] Co-insurance detected: ${raw}% reimbursement rate (already converted by GPT)`)
          }
        }

        const analysis = {
          completeness: stage2Result.completeness,
          missingInfo: stage2Result.missingInfo || [],
          missingDocumentHint: stage2Result.missingDocumentHint || null,
          // petInfo and billInfo come from Stage 1 ONLY — never backfill from policy/Stage 2
          petInfo: stage1Result.petInfo || { name: null, species: null, breed: null },
          billInfo: {
            clinic: stage1Result.clinicInfo?.name || null,   // Stage 1 only — null is OK
            date: stage1Result.clinicInfo?.date || null,     // Stage 1 only — null is OK
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

  // ========================================
  // POST /api/pciq/analyze
  // Mobile app (Pet ClaimIQ) bridge route.
  // Accepts a Supabase storage path, downloads the file,
  // runs the same two-stage analysis engine as /api/analyze-claim,
  // and returns the mobile response shape.
  // Does NOT modify /api/analyze-claim.
  // ========================================

  // --- helpers (mirrors /api/analyze-claim internals) ---

  const pciqExtractPdfText = async (buffer, filename) => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
      const pieces = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pieces.push((content.items || []).map(it => it.str || '').join(' '))
      }
      console.log(`[pciq/analyze] Extracted ${pieces.length} pages from ${filename}`)
      return pieces.join('\n\n')
    } catch (err) {
      console.error(`[pciq/analyze] PDF extraction failed for ${filename}:`, err.message)
      throw new Error(`Failed to read PDF: ${filename}`)
    }
  }

  const pciqPdfToFileInput = (buffer, filename) => ({
    type: 'file',
    file: { filename, file_data: `data:application/pdf;base64,${buffer.toString('base64')}` }
  })

  const pciqToDataUrl = (buffer, mime) =>
    `data:${mime};base64,${buffer.toString('base64')}`

  // ═══════════════════════════════════════════════════════════════
  // Shared analysis helpers (used by main bill route + Route 3)
  // ═══════════════════════════════════════════════════════════════

  const pciqRunStage1 = async ({ openai, tag, vetBillFileContents, vetBillTextBackup }) => {
      const extractionPrompt = `You are a veterinary invoice parser. Your ONLY job is to extract data from the attached vet bill/invoice and classify the visit type. Do not perform any insurance coverage analysis.

CRITICAL — DOCUMENT SCOPE:
- You are reading a VET BILL or INVOICE only. Do NOT extract or infer any values from an insurance policy document.
- clinic_name must be the name of the veterinary clinic or animal hospital that provided services — NEVER an insurance company name (e.g., never "Westchester Fire Insurance Company", "Healthy Paws", "Pumpkin", etc.)
- visit_date must be the date services were rendered on the invoice — NEVER a policy effective date or expiration date
- If you cannot find a value with confidence, return null for that field — do NOT guess or pull from non-vet-bill content

EXTRACTION RULES:
1. Use ONLY the TOTAL column (rightmost dollar amount) for each line item — never the Quantity or Unit Price columns.
2. Vet bill columns are typically: Description | Quantity | Total. The dollar amount is always the last column.
3. VALIDATION: Your line item amounts must sum to the invoice total shown on the bill. If they do not match, re-read and correct.
4. Items with $0.00 totals should still be listed with amount: 0.
5. Watch for quantity values that look like prices (e.g., Quantity: 100.00 with Total: $0.00 — the amount is 0, not 100).
6. Watch for quantities with decimals (e.g., 1.18) — this is a quantity multiplied by unit price, NOT a dollar amount.

SERVICE DATE EXTRACTION (REQUIRED):
- Extract the date the pet was seen by the veterinarian. This is the visit/service date, NOT the invoice print date, payment date, or account statement date.
- Look for labels like "Date:", "Date of Service:", "Service Date:", "Visit Date:", "Exam Date:", or a date printed near the clinic header or near the line items.
- Return as clinicInfo.date in YYYY-MM-DD format (e.g., "2026-01-27").
- If multiple dates appear on the bill, use the earliest service/treatment date — not the payment or statement date.
- This field is REQUIRED — search the entire document thoroughly before returning null.

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

      console.log(`${tag} Stage 1: Extracting vet bill...`, { files: vetBillFileContents.length })

      const stage1Completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a veterinary invoice parser. Extract data accurately and return valid JSON only.' },
          { role: 'user', content: [{ type: 'text', text: extractionPrompt }, ...vetBillFileContents] }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })

      const stage1Content = stage1Completion.choices?.[0]?.message?.content ?? ''
      let stage1Result = null
      try {
        let c = stage1Content.trim()
        if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
        stage1Result = JSON.parse(c)
      } catch {
        const m = stage1Content.match(/\{[\s\S]*\}/)
        if (m) { try { stage1Result = JSON.parse(m[0]) } catch {} }
      }

      if (!stage1Result) {
        console.error(`${tag} Stage 1 failed to parse:`, stage1Content.substring(0, 500))
        throw new Error('Failed to extract bill data. Please try again.')
      }

      console.log(`${tag} Stage 1 complete:`, {
        visitType: stage1Result.visitType,
        lineItems: stage1Result.lineItems?.length,
        totalBill: stage1Result.totalBill
      })

      // ── Post-Stage 1 validation: reject policy-document contamination ──
      const insurerNames = ['insurance', 'westchester', 'chubb', 'pumpkin', 'healthy paws', 'embrace', 'odie', 'fetch', 'figo', 'nationwide', 'trupanion', 'lemonade', 'spot', 'pets best']
      const rawClinic = stage1Result.clinicInfo?.name || ''
      if (rawClinic && insurerNames.some(n => rawClinic.toLowerCase().includes(n))) {
        console.warn(`${tag} ⚠ Stage 1 clinic_name rejected (looks like insurer): "${rawClinic}"`)
        stage1Result.clinicInfo.name = null
      }
      const rawDate = stage1Result.clinicInfo?.date || null
      if (rawDate) {
        const parsedDate = new Date(rawDate)
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        if (!isNaN(parsedDate.getTime()) && parsedDate < sixMonthsAgo) {
          console.warn(`${tag} ⚠ Stage 1 visit_date suspicious (>6mo old): "${rawDate}"`)
        }
      }
      if (!stage1Result.totalBill || stage1Result.totalBill === 0) {
        console.warn(`${tag} ⚠ Stage 1 totalBill is null or 0`)
      }

      // ── Filter out phantom/summary line items ──
      const phantomPatterns = /^(invoice complete|total|balance due|amount due|subtotal|grand total|payment received|amount paid|change due|previous balance|account balance|statement total)$/i
      if (stage1Result.lineItems && Array.isArray(stage1Result.lineItems)) {
        const before = stage1Result.lineItems.length
        stage1Result.lineItems = stage1Result.lineItems.filter(item => {
          const desc = (item.description || '').trim()
          if (phantomPatterns.test(desc)) {
            console.log(`${tag} Filtered phantom line item: "${desc}" ($${item.amount})`)
            return false
          }
          return true
        })
        if (stage1Result.lineItems.length < before) {
          console.log(`${tag} Removed ${before - stage1Result.lineItems.length} phantom line item(s)`)
        }
      }

      return stage1Result
  }

  const pciqRunStage2 = async ({ openai, tag, stage1Result, policyFileContents, policyTextBackup, savedPolicy, vetBillTextBackup }) => {
      // STEP 4 — Build saved-policy context string for Stage 2 prompt
      let savedPolicyContext = ''
      if (savedPolicy) {
        savedPolicyContext = `
SAVED POLICY PARAMETERS (from user's account — use these as ground truth when policy documents are absent or incomplete):
  Carrier: ${savedPolicy.carrier || 'Unknown'}
  Pet Name: ${savedPolicy.pet_name || 'Unknown'}
  Species: ${savedPolicy.species || 'Unknown'}
  Deductible: $${savedPolicy.deductible ?? 'Unknown'}
  Reimbursement Rate: ${savedPolicy.reimbursement_rate != null ? savedPolicy.reimbursement_rate + '%' : 'Unknown'}
  Annual Limit: ${savedPolicy.annual_limit != null ? '$' + savedPolicy.annual_limit : 'Unknown'}
  Math Order: ${savedPolicy.math_order || 'Unknown'}
  Effective Date: ${savedPolicy.effective_date || 'Unknown'}
  Exclusions: ${(savedPolicy.exclusions || []).join(', ') || 'None listed'}
  Policy Notes: ${savedPolicy.policy_text || 'None'}

IMPORTANT: These saved policy parameters are the user's VERIFIED values. ALWAYS use these for deductible, reimbursement rate, annual limit, and math order — even if the attached policy documents show different numbers (the PDF may show a different pet, plan tier, or outdated values). Only use PDF-extracted values for fields marked "Unknown" above.
`
      }

      // STEP 5 — Stage 2: Coverage analysis
      const coveragePrompt = `You are a pet insurance coverage analyst. A structured extraction of the vet bill has already been completed in Stage 1. Your job is ONLY to determine coverage and calculate reimbursement. Do not re-extract line items or re-classify the visit type.

STAGE 1 EXTRACTION (treat as ground truth — do not modify):
${JSON.stringify(stage1Result, null, 2)}

THE VISIT TYPE IS: ${stage1Result.visitType}
This is FINAL and IMMUTABLE. Do not reconsider it under any circumstances.
${savedPolicyContext}
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
If partial, populate missingInfo[] with user-friendly descriptions.
Include missingDocumentHint.

STEP B — EXTRACT POLICY PARAMETERS FROM THE DECLARATIONS PAGE:
Find and extract each field exactly as written — do NOT guess or invent values. Return null for any field not clearly present.

REIMBURSEMENT RATE: Look for "Co-Insurance", "Coinsurance %", "Reimbursement Rate", "Insurer Pays". Return as plain integer (70 means 70%). Do NOT return 0.70.
IMPORTANT: The reimbursement_rate must represent the percentage the INSURER pays. If saved policy parameters above provide a reimbursement rate, it has ALREADY been correctly converted — use it directly. Do not re-interpret or re-convert co-insurance values from the policy document.
ANNUAL DEDUCTIBLE: Look for "Annual Deductible", "Deductible", "Per Policy Period Deductible". Return as plain number.
ANNUAL LIMIT: Look for "Annual Limit", "Policy Maximum", "Annual Maximum". Return as plain number or null.
CARRIER BRAND NAME: Use consumer-facing brand name, not underwriter (see mappings above).
MATH ORDER: Look for a worked example showing order of operations.
  reimbursement-first: percentage applied first, then deductible subtracted
  deductible-first: deductible subtracted first, then percentage applied
  null if cannot determine
FILING DEADLINE: e.g., "90 days from date of service" or null.
POLICY PET NAME: pet name from declarations page or null.
POLICY EFFECTIVE DATE: return in YYYY-MM-DD format or null.

STEP C — DETERMINE COVERAGE FOR EACH LINE ITEM:
Apply these rules in ORDER:

RULE 1 — EXAM FEE RULE: Visit type is "${stage1Result.visitType}".
- WELLNESS_VISIT: any exam/office visit fee is EXCLUDED regardless of policy declarations
- SICK_INJURY_VISIT: exam fee follows carrier-specific rules (RULE 3)

RULE 2 — WELLNESS/PREVENTIVE: Items categorized "vaccination" or "preventive" are EXCLUDED.

RULE 2B — VISIT-TYPE CONTEXT FOR AMBIGUOUS ITEMS: The visit has been classified as "${stage1Result.visitType}". This MUST influence how you classify items that could be either preventive or problem-driven:
- If visit_type is WELLNESS_VISIT: Diagnostic tests (e.g., fluorescein stain, blood panel, urinalysis, fecal test, heartworm test), medications (e.g., eye drops, ear drops, antibiotics, ointments), and procedures that COULD be either routine screening or problem-driven MUST be classified as EXCLUDED under the preventive/routine care exclusion UNLESS the vet bill explicitly mentions a specific diagnosis, complaint, symptom, or medical condition being treated (e.g., "eye infection", "ear infection", "skin rash", "limping", "vomiting"). The key question: Does the vet bill show ANY evidence that this item was used to diagnose or treat a SPECIFIC medical problem? If not, it is routine preventive care on a wellness visit and should be EXCLUDED.
- If visit_type is SICK_INJURY_VISIT, SURGERY_VISIT, or EMERGENCY_VISIT: The same items should be classified according to standard policy coverage rules (diagnostic tests covered, prescribed medications covered, etc.) because the visit context implies they are medically necessary for a specific condition.

RULE 3 — CARRIER-SPECIFIC RULES: Use ONLY exclusions from the attached policy documents.
- Healthy Paws: exam fees always excluded (blanket exclusion)
- Pumpkin: exam fees covered for sick/injury visits
- Apply all other carrier-specific exclusions found in uploaded documents only

RULE 4 — PRE-OP/POST-OP INHERITANCE: Pre/post-op items inherit coverage from the associated surgery.

RULE 5 — RADIOLOGY/SPECIALIST READS: Radiologist reads of diagnostic images are DIAGNOSTIC TESTS, not exam fees. Mark as COVERED.

RULE 5B — WASTE DISPOSAL EXCLUSION (apply on ALL visit types):
Medical Waste Disposal Fee, Hazardous Waste/Sharps Fee, Biohazard Disposal Fee, Sharps Disposal Fee, and any similar waste, sharps, or biohazard disposal charges are ALWAYS excluded. These are administrative clinic fees, not medical treatments, diagnostics, or medications. Exclude on ALL visit types. Reason: "Excluded — Administrative fee: waste/sharps disposal is a clinic operational cost, not a covered medical expense."

RULE 6 — DEFAULT: Pet insurance covers on an EXCLUSION basis. Medically necessary treatment IS covered unless explicitly excluded. Default to COVERED, not UNKNOWN.

RULE 7 — PRESCRIPTION DIET: Covered when prescribed to treat a specific covered condition.

RULE 8 — E-COLLAR: Covered as a medical supply when provided as part of post-surgical care for a covered procedure.

For each line item from Stage 1:
- "covered": true | false | null
- "reason": "Covered — [category]" or "Excluded — [reason]" or "Uncertain — [reason]"
- "sourceQuote": REQUIRED for BOTH covered AND excluded items. Extract the verbatim policy language (1-2 sentences, word-for-word from the policy document) that justifies the coverage decision. For COVERED items, find the insuring agreement, covered benefits, or benefit provisions describing this service type (e.g., "Veterinary Treatment means: b. Laboratory and diagnostic tests"). For EXCLUDED items, find the exclusion clause. Return null ONLY if no policy was uploaded. NEVER return "" when a policy is present — the insuring agreement always describes what is covered.
- "section": policy section or null

STEP D — CALCULATE REIMBURSEMENT:
- totalCovered = sum of covered items
- totalExcluded = sum of excluded items
- maxReimbursement = totalCovered x (reimbursementRate / 100)
- maxReimbursement must be a positive number when totalCovered > 0

STEP E — FILING RECOMMENDATION:
- shouldFile: true if totalCovered > 0 (even sub-deductible claims build deductible progress)
- shouldFile: false ONLY if totalCovered === 0
- shouldFileReason: explain the decision

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
    "eligibilityWarnings": []
  }
}

IMPORTANT: Use numbers not strings for amounts. reimbursementRate must be an integer (80 not 0.80). Return ONLY the JSON object.`

      console.log(`${tag} Stage 2: Running coverage analysis...`, {
        policyFiles: policyFileContents.length,
        visitType: stage1Result.visitType
      })

      const stage2Completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a pet insurance coverage analyst. Provide accurate analysis. Always return valid JSON.' },
          { role: 'user', content: [{ type: 'text', text: coveragePrompt }, ...policyFileContents] }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })

      const stage2Content = stage2Completion.choices?.[0]?.message?.content ?? ''
      let stage2Result = null
      try {
        let c = stage2Content.trim()
        if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
        stage2Result = JSON.parse(c)
      } catch {
        const m = stage2Content.match(/\{[\s\S]*\}/)
        if (m) { try { stage2Result = JSON.parse(m[0]) } catch {} }
      }

      if (!stage2Result) {
        console.error(`${tag} Stage 2 failed to parse:`, stage2Content.substring(0, 500))
        throw new Error('Failed to analyze coverage. Please try again.')
      }

      console.log(`${tag} Stage 2 complete:`, {
        completeness: stage2Result.completeness,
        carrier: stage2Result.policyInfo?.carrier,
        totalCovered: stage2Result.analysis?.totalCovered,
        lineItems: stage2Result.analysis?.lineItems?.length
      })

      // STEP 6 — Recalculate reimbursement server-side (same logic as /api/analyze-claim)
      // Prefer saved policy parameters over AI-extracted values (AI can misread policy docs)
      const s2a = stage2Result.analysis || {}
      const s2p = stage2Result.policyInfo || {}

      // ── Co-insurance safety net (mobile route) ──
      if (s2p.reimbursementRate != null && s2p.rateIsCoinsurance === true) {
        const raw = s2p.reimbursementRate
        if (raw <= 30) {
          s2p.reimbursementRate = 100 - raw
          console.log(`${tag} Co-insurance safety net: converted ${raw}% co-insurance → ${s2p.reimbursementRate}% reimbursement rate`)
        } else {
          console.log(`${tag} Co-insurance detected: ${raw}% reimbursement rate (already converted by GPT)`)
        }
      }

      // ── Wellness Endorsement Override ──
      // If this is a wellness visit AND the policy has a preventive care endorsement,
      // override GPT's blanket exclusions and apply endorsement category math instead.
      const wellnessEndorsement = savedPolicy?.wellness_endorsement || null
      let wellnessEndorsementApplied = false
      let wellnessEndorsementReimbursement = 0

      if (wellnessEndorsement?.has_endorsement && (stage1Result.visitType || '').toUpperCase() === 'WELLNESS_VISIT' && Array.isArray(s2a.lineItems)) {
        console.log(`${tag} Wellness endorsement detected — applying endorsement math`)
        const endorseRate = (wellnessEndorsement.reimbursement_rate || 0) / 100
        const categories = wellnessEndorsement.categories || {}

        // Map line items to endorsement categories by description keywords
        const catMap = [
          { cat: 'wellness_exam', keywords: ['exam', 'consultation', 'office visit', 'physical'] },
          { cat: 'vaccines', keywords: ['vaccine', 'vaccination', 'rabies', 'distemper', 'bordetella', 'leptospirosis', 'lyme', 'parvo', 'dapp', 'dhpp', 'fvrcp'] },
          { cat: 'fecal_parasite_exam', keywords: ['fecal', 'parasite exam', 'parasite screen', 'fecal float', 'ova and parasite'] },
          { cat: 'heartworm_test', keywords: ['heartworm test', 'heartworm screen', '4dx', 'hw test'] },
          { cat: 'bloodwork', keywords: ['blood', 'cbc', 'chemistry', 'blood panel', 'blood work', 'bloodwork', 'metabolic panel'] },
          { cat: 'flea_tick_heartworm_meds', keywords: ['flea', 'tick', 'heartworm prev', 'simparica', 'nexgard', 'heartgard', 'bravecto', 'interceptor', 'sentinel', 'revolution', 'seresto', 'advantage', 'frontline', 'credelio'] },
          { cat: 'deworming', keywords: ['deworm', 'dewormer', 'pyrantel', 'panacur', 'fenbendazole', 'drontal'] },
          { cat: 'routine_hygiene', keywords: ['nail trim', 'dental clean', 'dental prophy', 'grooming', 'ear clean', 'teeth clean', 'anal gland'] },
        ]

        // Track how much of each category limit has been used
        const catUsed = {}
        let endorseTotalCovered = 0
        let endorseTotalExcluded = 0

        for (const item of s2a.lineItems) {
          const descLower = (item.description || '').toLowerCase()
          const amt = item.amount || 0

          // Find matching endorsement category
          let matchedCat = null
          for (const { cat, keywords } of catMap) {
            if (keywords.some(kw => descLower.includes(kw))) {
              matchedCat = cat
              break
            }
          }

          if (matchedCat && categories[matchedCat]) {
            const catConfig = categories[matchedCat]
            const catLimit = catConfig.limit || 0
            const used = catUsed[matchedCat] || 0
            const remaining = Math.max(0, catLimit - used)

            if (remaining > 0) {
              const eligible = Math.min(amt, remaining)
              const reimbursement = Math.round(eligible * endorseRate * 100) / 100
              const overCap = Math.max(0, amt - remaining)

              catUsed[matchedCat] = used + eligible
              endorseTotalCovered += eligible
              wellnessEndorsementReimbursement += reimbursement

              item.covered = true
              item.reason = `Covered (Wellness Endorsement) — ${matchedCat.replace(/_/g, ' ')} category, up to $${catLimit} at ${wellnessEndorsement.reimbursement_rate}%, no deductible`

              if (overCap > 0) {
                endorseTotalExcluded += overCap
                item.reason += `. $${eligible.toFixed(2)} eligible, $${overCap.toFixed(2)} exceeds category cap.`
              }
            } else {
              // Category limit already exhausted
              item.covered = false
              item.reason = `Excluded — ${matchedCat.replace(/_/g, ' ')} category limit ($${catConfig.limit}) already reached`
              endorseTotalExcluded += amt
            }
          } else {
            // No matching endorsement category — stays excluded
            if (!item.covered) {
              item.reason = item.reason || 'Not covered under wellness endorsement'
              endorseTotalExcluded += amt
            }
          }
        }

        // Recalculate totals
        s2a.totalCovered = Math.round(endorseTotalCovered * 100) / 100
        s2a.totalExcluded = Math.round(endorseTotalExcluded * 100) / 100
        wellnessEndorsementReimbursement = Math.round(wellnessEndorsementReimbursement * 100) / 100
        wellnessEndorsementApplied = true

        console.log(`${tag} Wellness endorsement result: covered=$${s2a.totalCovered} excluded=$${s2a.totalExcluded} reimbursement=$${wellnessEndorsementReimbursement}`)
      }

      const totalCovered = s2a.totalCovered || 0
      const rateRaw = (savedPolicy?.reimbursement_rate ?? s2p.reimbursementRate) || null
      const deductible = (savedPolicy?.deductible ?? s2p.deductible) || 0
      const annualLimit = (savedPolicy?.annual_limit ?? s2p.annualLimit) || null
      const mathOrder = (savedPolicy?.math_order ?? s2p.mathOrder) || 'reimbursement-first'

      // ── Diagnostic: show where each policy value came from ──
      console.log(`${tag} Policy value sources:`, {
        rate: savedPolicy?.reimbursement_rate != null ? `${savedPolicy.reimbursement_rate}% (DB)` : `${s2p.reimbursementRate}% (GPT)`,
        deductible: savedPolicy?.deductible != null ? `$${savedPolicy.deductible} (DB)` : `$${s2p.deductible} (GPT)`,
        annualLimit: savedPolicy?.annual_limit != null ? `$${savedPolicy.annual_limit} (DB)` : `$${s2p.annualLimit} (GPT)`,
        mathOrder: savedPolicy?.math_order ? `${savedPolicy.math_order} (DB)` : `${s2p.mathOrder} (GPT)`,
        savedPolicyPresent: !!savedPolicy,
      })

      let maxReimbursement = s2a.maxReimbursement || 0
      if (wellnessEndorsementApplied) {
        // Endorsement: no deductible, pre-calculated reimbursement from category math
        maxReimbursement = wellnessEndorsementReimbursement
      } else if (totalCovered > 0 && rateRaw) {
        const rate = rateRaw / 100
        maxReimbursement = mathOrder === 'deductible-first'
          ? (totalCovered - deductible) * rate
          : (totalCovered * rate) - deductible
        maxReimbursement = Math.round(Math.max(0, maxReimbursement) * 100) / 100
      }

      // STEP 7 — Map to mobile response shape
      const shouldFile = wellnessEndorsementApplied ? (wellnessEndorsementReimbursement > 0) : (s2a.shouldFile ?? false)
      const recommendation = shouldFile ? 'file' : 'skip'

      const reimbursementIfDeductibleMet = wellnessEndorsementApplied
        ? wellnessEndorsementReimbursement
        : (totalCovered > 0 && rateRaw)
          ? Math.round(totalCovered * (rateRaw / 100) * 100) / 100
          : 0

      // ── Date eligibility check: service date vs policy effective date ──
      let dateEligibilityWarning = null
      const visitDate = stage1Result.clinicInfo?.date || null
      const policyEffectiveDate = savedPolicy?.effective_date || null
      if (visitDate && policyEffectiveDate) {
        const visitD = new Date(visitDate)
        const effectiveD = new Date(policyEffectiveDate)
        if (!isNaN(visitD.getTime()) && !isNaN(effectiveD.getTime()) && visitD < effectiveD) {
          const fmtVisit = visitD.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
          const fmtEffective = effectiveD.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
          dateEligibilityWarning = `Warning: This vet bill's service date (${fmtVisit}) is before your policy effective date (${fmtEffective}). This claim would not be eligible for coverage.`
          console.log(`${tag} ⚠ Date eligibility: visit ${visitDate} < policy effective ${policyEffectiveDate}`)
        }
      }

      // ── Pet name mismatch check: vet bill pet vs policy pet ──
      let petMismatchWarning = null
      const billPetName = (stage1Result.petInfo?.name || '').trim()
      const policyPetName = (savedPolicy?.pet_name || '').trim()
      if (billPetName && policyPetName) {
        const billLower = billPetName.toLowerCase()
        const policyLower = policyPetName.toLowerCase()
        if (billLower !== policyLower) {
          // Fuzzy: check if one name contains the other (handles nicknames like "Bella" vs "Isabella")
          const isSubstring = billLower.length >= 2 && policyLower.length >= 2 &&
            (policyLower.includes(billLower) || billLower.includes(policyLower))
          if (!isSubstring) {
            petMismatchWarning = `The pet on this vet bill (${billPetName}) doesn't match the pet on your policy (${policyPetName}). Make sure you selected the right policy.`
            console.log(`${tag} ⚠ Pet name mismatch: bill="${billPetName}" policy="${policyPetName}"`)
          }
        }
      }

      // ── Carrier mismatch check: carrier name detected in vet bill vs policy carrier ──
      let carrierMismatchWarning = null
      const policyCarrier = (savedPolicy?.carrier || '').trim()
      if (policyCarrier && Array.isArray(vetBillTextBackup) && vetBillTextBackup.length > 0) {
        const knownCarriers = ['Healthy Paws', 'Pumpkin', 'Odie', 'Figo', 'Embrace', 'Nationwide', 'Pets Best', 'ASPCA', 'Trupanion', 'Lemonade', 'Spot', 'MetLife', 'Fetch']
        // Only check the first ~500 chars of text backup (header area) for confident detection
        const headerText = vetBillTextBackup.join('\n').substring(0, 500)
        const policyCarrierLower = policyCarrier.toLowerCase()
        for (const carrier of knownCarriers) {
          const carrierLower = carrier.toLowerCase()
          if (headerText.toLowerCase().includes(carrierLower) && !policyCarrierLower.includes(carrierLower)) {
            carrierMismatchWarning = `This document appears to reference ${carrier} but you're analyzing against your ${policyCarrier} policy. Make sure you selected the right policy.`
            console.log(`${tag} ⚠ Carrier mismatch: detected="${carrier}" policy="${policyCarrier}"`)
            break
          }
        }
      }

      // ── Build combined warnings array for the app ──
      const serverWarnings = [
        ...(s2a.eligibilityWarnings || []),
        ...(petMismatchWarning ? [petMismatchWarning] : []),
        ...(carrierMismatchWarning ? [carrierMismatchWarning] : []),
      ]

      // ── Plain-English Summary Generation ──
      const summaryLineItems = (s2a.lineItems || []).map(item => ({
        description: item.description,
        amount: item.amount,
        covered: item.covered ?? false,
        reason: item.reason || '',
      }))
      const summaryPetName = savedPolicy?.pet_name || stage1Result.petInfo?.name || 'Your pet'
      const summaryCarrier = savedPolicy?.carrier || s2p.carrier || 'your insurance'
      const summaryClinic = stage1Result.clinicInfo?.name || 'the vet'
      const summaryDate = (() => {
        const raw = stage1Result.clinicInfo?.date
        if (!raw) return 'a recent visit'
        const d = new Date(raw + 'T00:00:00')
        return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      })()
      const summaryTotalBill = (s2a.totalBill || stage1Result.totalBill || 0)
      const summaryRate = rateRaw || 0
      const summaryRateWhole = Math.round(summaryRate)
      const summaryRateDec = summaryRate / 100
      const summaryDeductible = deductible
      const fmt$ = n => `$${Math.max(0, n).toFixed(2)}`
      const isCoinsFirst = /healthy\s*paws|fetch/i.test(summaryCarrier)

      const coveredItems = summaryLineItems.filter(i => i.covered)
      const excludedItems = summaryLineItems.filter(i => !i.covered)
      const wellnessReasons = ['wellness', 'preventive', 'routine', 'vaccine', 'vaccination', 'annual checkup', 'annual wellness', 'parasite screening', 'fecal test', 'heartworm test']
      const isWellnessExclusion = (r, desc) => {
        const reasonLower = (r || '').toLowerCase()
        const descLower = (desc || '').toLowerCase()
        // "exam" alone is NOT wellness — many carriers exclude exam fees on ALL visit types
        // Only count as wellness if reason explicitly says wellness/preventive/routine
        return wellnessReasons.some(w => reasonLower.includes(w) || descLower.includes(w))
      }
      const allExcludedAreWellness = excludedItems.length > 0 && excludedItems.every(i => isWellnessExclusion(i.reason, i.description))
      const visitType = (stage1Result.visitType || '').toLowerCase()

      let summaryScenario = 'SICK_PARTIAL'
      if (wellnessEndorsementApplied) {
        summaryScenario = 'WELLNESS_ENDORSEMENT_COVERED'
      } else if (visitType.includes('wellness') || (excludedItems.length === summaryLineItems.length && allExcludedAreWellness)) {
        summaryScenario = 'WELLNESS_ALL_EXCLUDED'
      } else if (coveredItems.length === summaryLineItems.length && coveredItems.length > 0) {
        summaryScenario = 'SICK_ALL_COVERED'
      } else if (excludedItems.length === summaryLineItems.length) {
        summaryScenario = 'SICK_NONE_COVERED'
      } else if (coveredItems.length > 0 && excludedItems.some(i => isWellnessExclusion(i.reason, i.description)) && excludedItems.length > 0) {
        summaryScenario = 'MIXED'
      }

      const joinNames = items => {
        const names = items.map(i => i.description)
        if (names.length === 0) return ''
        if (names.length === 1) return names[0]
        return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
      }

      const buildMathSentences = () => {
        if (!summaryRate || totalCovered <= 0) return ''
        let reimbHigh, reimbLow
        if (isCoinsFirst) {
          reimbHigh = totalCovered * summaryRateDec
          reimbLow = (totalCovered * summaryRateDec) - summaryDeductible
        } else {
          reimbHigh = totalCovered * summaryRateDec
          reimbLow = (totalCovered - summaryDeductible) * summaryRateDec
        }
        reimbHigh = Math.round(Math.max(0, reimbHigh) * 100) / 100
        reimbLow = Math.round(Math.max(0, reimbLow) * 100) / 100

        let sentences = `If your ${fmt$(summaryDeductible)} deductible is already met: ${fmt$(reimbHigh)} estimated reimbursement.`
        if (summaryDeductible > 0) {
          if (reimbLow > 0) {
            sentences += ` If your full deductible still applies: ${fmt$(reimbLow)} estimated reimbursement.`
          } else {
            sentences += ` If your full deductible still applies: $0.00 — your deductible has not yet been met on this visit. Once your annual deductible is satisfied, future eligible claims will reimburse at your ${summaryRateWhole}%.`
          }
        }
        return sentences
      }

      const plainReason = r => {
        if (!r) return 'it is not covered under your policy'
        // Strip "Excluded — ", "Excluded - ", "excluded:" etc. prefixes
        let cleaned = r.replace(/^excluded\s*[-—–:]\s*/i, '').trim()
        // Strip trailing carrier policy boilerplate like "under healthy paws policy"
        cleaned = cleaned.replace(/\s+under\s+\S+(\s+\S+)?\s+policy\.?$/i, '').trim()
        const lower = cleaned.toLowerCase()
        if (lower.includes('wellness') || lower.includes('preventive') || lower.includes('routine')) return 'it is considered a routine/wellness item'
        if (lower.includes('pre-existing') || lower.includes('preexisting')) return 'it is related to a pre-existing condition'
        if (lower.includes('waiting')) return 'it falls within the waiting period'
        if (lower.includes('breed') || lower.includes('hereditary')) return 'it is a breed-specific or hereditary exclusion'
        if (lower.includes('cosmetic') || lower.includes('elective')) return 'it is considered an elective or cosmetic procedure'
        if (lower.includes('food') || lower.includes('supplement') || lower.includes('diet')) return 'food and supplements are not covered'
        if (lower.includes('waste') || lower.includes('disposal')) return 'waste disposal fees are not covered'
        if (cleaned.length > 80) return 'it is not covered under your policy'
        // Lowercase the first char for sentence flow ("is excluded because exam fees...")
        let result = cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
        // Remove trailing period — the template adds punctuation
        result = result.replace(/\.+$/, '')
        return result
      }

      // Smart item list: name items if ≤3, otherwise show count + total
      const itemList = (items, label) => {
        if (items.length <= 3) return joinNames(items)
        const total = items.reduce((s, i) => s + (i.amount || 0), 0)
        return `${items.length} items totaling ${fmt$(total)}`
      }

      let summaryText = ''
      switch (summaryScenario) {
        case 'WELLNESS_ENDORSEMENT_COVERED': {
          const endorseRate = wellnessEndorsement?.reimbursement_rate || 70
          const coveredDesc = coveredItems.length <= 3
            ? `${joinNames(coveredItems)} are covered under your Preventive Care Endorsement`
            : `${coveredItems.length} items totaling ${fmt$(totalCovered)} are covered under your Preventive Care Endorsement`
          let excDesc = ''
          if (excludedItems.length > 0) {
            excDesc = excludedItems.length <= 3
              ? ` The ${joinNames(excludedItems)} ${excludedItems.length === 1 ? 'is' : 'are'} not covered by the endorsement.`
              : ` ${excludedItems.length} items totaling ${fmt$(s2a.totalExcluded || 0)} are not covered by the endorsement.`
          }
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} was a routine wellness visit. Your ${summaryCarrier} Preventive Care Endorsement covers eligible wellness items at ${endorseRate}% with no deductible, subject to per-category annual limits. ${coveredDesc} — estimated reimbursement: ${fmt$(wellnessEndorsementReimbursement)}.${excDesc}`
          break
        }
        case 'WELLNESS_ALL_EXCLUDED': {
          const wellnessDesc = excludedItems.length <= 3
            ? `The ${joinNames(excludedItems)} on this bill are considered wellness or preventive care under your ${summaryCarrier} plan.`
            : `All ${excludedItems.length} items on this bill are considered wellness or preventive care under your ${summaryCarrier} plan.`
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} was a routine wellness visit. Your ${summaryCarrier} plan covers accidents and illness but does not include preventive or routine care. ${wellnessDesc} Estimated reimbursement: $0.00. If ${summaryPetName} has a sick visit or injury, that's when your ${summaryCarrier} coverage kicks in.`
          break
        }
        case 'SICK_ALL_COVERED':
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} was an illness/injury visit. Every item on this ${fmt$(summaryTotalBill)} bill is covered under your ${summaryCarrier} plan. ${buildMathSentences()}`
          break
        case 'SICK_PARTIAL': {
          let excDetails
          if (excludedItems.length === 1) {
            excDetails = `The ${excludedItems[0].description} (${fmt$(excludedItems[0].amount)}) is excluded because ${plainReason(excludedItems[0].reason)}.`
          } else if (excludedItems.length <= 3) {
            excDetails = excludedItems.map(i => `the ${i.description} (${fmt$(i.amount)})`).join(', ').replace(/, ([^,]+)$/, ' and $1')
            excDetails = `The ${excDetails.slice(4)} are excluded.`
          } else {
            const exclAmt = excludedItems.reduce((s, i) => s + (i.amount || 0), 0)
            excDetails = `${excludedItems.length} items totaling ${fmt$(exclAmt)} are excluded under your policy.`
          }
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} was an illness/injury visit. Of the ${fmt$(summaryTotalBill)} total, ${fmt$(totalCovered)} is covered under your ${summaryCarrier} plan. ${excDetails} ${buildMathSentences()}`
          break
        }
        case 'SICK_NONE_COVERED': {
          const primaryReason = excludedItems.length > 0 ? plainReason(excludedItems[0].reason) : 'these services are not eligible'
          const guidance = (() => {
            const r = (excludedItems[0]?.reason || '').toLowerCase()
            if (r.includes('wellness') || r.includes('preventive')) return `If ${summaryPetName} has a sick visit or injury, that's when your coverage kicks in.`
            if (r.includes('pre-existing') || r.includes('preexisting')) return 'Coverage may apply to new, unrelated conditions.'
            if (r.includes('waiting')) return 'Once the waiting period ends, similar services will be eligible.'
            return `Coverage applies to eligible accidents and illnesses under your ${summaryCarrier} plan.`
          })()
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} included services that are not eligible for coverage under your ${summaryCarrier} plan. The primary reason: ${primaryReason}. Estimated reimbursement: $0.00. ${guidance}`
          break
        }
        case 'MIXED': {
          const wellnessExcluded = excludedItems.filter(i => isWellnessExclusion(i.reason, i.description))
          const mixedExcItems = wellnessExcluded.length > 0 ? wellnessExcluded : excludedItems
          const excludedAmt = excludedItems.reduce((s, i) => s + (i.amount || 0), 0)
          const wellnessDesc = mixedExcItems.length <= 3
            ? `The wellness items (${joinNames(mixedExcItems)}) are not covered under your ${summaryCarrier} plan`
            : `${mixedExcItems.length} items totaling ${fmt$(excludedAmt)} are wellness or preventive care and are not covered`
          const coveredDesc = coveredItems.length <= 3
            ? `The illness-related items (${joinNames(coveredItems)}) are covered`
            : `${coveredItems.length} items totaling ${fmt$(totalCovered)} are illness-related and covered`
          summaryText = `${summaryPetName}'s visit to ${summaryClinic} on ${summaryDate} included both routine and illness-related items. ${wellnessDesc} — that's ${fmt$(excludedAmt)} excluded. ${coveredDesc} — that's ${fmt$(totalCovered)} eligible. ${buildMathSentences()}`
          break
        }
      }
      if (summaryText) {
        summaryText += ' This estimate does not account for pre-existing conditions. Pet ClaimIQ is an independent coverage analysis tool, not an adjuster or insurance advisor.'
      }
      console.log(`${tag} Summary scenario: ${summaryScenario}`)

      const mobileResponse = {
        estimated_reimbursement: maxReimbursement,
        total_bill: s2a.totalBill || stage1Result.totalBill || 0,
        recommendation,
        line_items: (s2a.lineItems || []).map(item => ({
          description: item.description,
          amount: item.amount,
          covered: item.covered ?? false,
          reason: item.reason || '',
          source_quote: item.sourceQuote || '',
          policy_section: item.sourceQuote || item.section || null,
        })),
        // Stage 1 fields ONLY — never backfill clinic/date from policy or Stage 2
        visit_type: stage1Result.visitType || null,
        clinic_name: stage1Result.clinicInfo?.name || null,   // Stage 1 only — null is OK
        visit_date: stage1Result.clinicInfo?.date || null,     // Stage 1 only — null is OK
        pet_name: savedPolicy?.pet_name || stage1Result.petInfo?.name || null,
        summary: summaryText,
        summary_scenario: summaryScenario,
        // Stage 2 / policy fields
        confidence: (() => {
          // Server-side confidence override — don't trust GPT's confidence assessment
          const hasFullPolicy = savedPolicy && savedPolicy.deductible != null && savedPolicy.reimbursement_rate != null
          const hasAnnualLimit = savedPolicy?.annual_limit != null || s2p.annualLimit != null
          const allItemsClassified = (s2a.lineItems || []).every(item => item.covered === true || item.covered === false)
          if (hasFullPolicy && allItemsClassified) {
            // Saved policy with deductible + rate present, and all line items classified → HIGH
            return 'High'
          }
          if (savedPolicy || stage2Result.completeness === 'full') {
            // Policy exists but missing some fields, or GPT says full but no saved policy
            if (!hasAnnualLimit || !allItemsClassified) return 'Medium'
            return 'High'
          }
          if (stage2Result.completeness === 'partial') return 'Medium'
          return 'Low' // bill_only or no policy
        })(),
        eligibility_warnings: serverWarnings.length ? serverWarnings : [],
        date_eligibility_warning: dateEligibilityWarning,
        carrier: savedPolicy?.carrier || s2p.carrier || null,
        deductible_total: deductible,
        deductible_used: 0,
        reimbursement_rate: rateRaw,
        covered_total: totalCovered,
        excluded_total: s2a.totalExcluded || 0,
        estimated_reimbursement_if_deductible_met: reimbursementIfDeductibleMet,
        estimated_reimbursement_actual: maxReimbursement,
        should_file: shouldFile,
        should_file_reason: s2a.shouldFileReason || '',
        filing_deadline_days: savedPolicy?.filing_deadline_days
          || (s2p.filingDeadline ? parseInt(s2p.filingDeadline) : null) || null,
        math_order: mathOrder,
        annual_limit: annualLimit,
      }

      return mobileResponse
  }


  app.post('/api/pciq/analyze', async (req, res) => {
    const tag = '[pciq/analyze]'
    try {
      // Auth
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }

      const { storage_path, doc_type, policy_id, bill_storage_path, eob_storage_path } = req.body || {}
      const user_id = user.id

      if (doc_type === 'both') {
        if (!bill_storage_path || !eob_storage_path) {
          return res.status(400).json({ error: 'bill_storage_path and eob_storage_path are required for doc_type "both"' })
        }
      } else if (!storage_path || !doc_type) {
        return res.status(400).json({ error: 'storage_path and doc_type are required' })
      }
      if (!['bill', 'eob', 'both'].includes(doc_type)) {
        return res.status(400).json({ error: 'doc_type must be "bill", "eob", or "both"' })
      }
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' })
      }

      console.log(`${tag} Request: doc_type=${doc_type} has_policy=${!!policy_id}`)

      // STEP 0 — Fetch saved policy from DB (if provided)
      let savedPolicy = null
      if (policy_id) {
        const { data: policyRow, error: policyErr } = await supabase
          .from('pciq_policies')
          .select('*')
          .eq('id', policy_id)
          .maybeSingle()
        if (policyErr) {
          console.log(`${tag} Policy lookup error:`, policyErr.message)
        } else if (!policyRow) {
          console.log(`${tag} Policy not found for id:`, policy_id)
        } else {
          savedPolicy = policyRow
          console.log(`${tag} Policy found: has_deductible=${savedPolicy.deductible != null} has_rate=${savedPolicy.reimbursement_rate != null} math_order=${savedPolicy.math_order}`)
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // ROUTE 3 — Bill + EOB Together (three-way comparison)
      // Downloads bill, EOB, and policy separately; three-stage pipeline
      // Returns early — never falls through to Route 1 / Route 2
      // ═══════════════════════════════════════════════════════════════
      if (doc_type === 'both' && bill_storage_path && eob_storage_path) {
        // Helper: download + prepare a file from Supabase Storage
        const downloadAndPrepare = async (path, label) => {
          const { data: blob, error: dlErr } = await supabase.storage
            .from('pciq-policies')
            .download(path)
          if (dlErr) throw new Error(`Failed to download ${label}: ${dlErr.message}`)
          const buf = Buffer.from(await blob.arrayBuffer())
          const name = path.split('/').pop() || 'document.pdf'
          const mime = name.toLowerCase().endsWith('.pdf') ? 'application/pdf'
            : /\.(jpe?g)$/i.test(name) ? 'image/jpeg'
            : name.toLowerCase().endsWith('.png') ? 'image/png'
            : 'application/pdf'
          const isPdf = mime === 'application/pdf'
          const fileContents = []
          const textBackup = []
          if (isPdf) {
            fileContents.push(pciqPdfToFileInput(buf, name))
            const text = await pciqExtractPdfText(buf, name)
            textBackup.push(`=== ${label} ===\n${text}`)
          } else {
            fileContents.push({ type: 'image_url', image_url: { url: pciqToDataUrl(buf, mime), detail: 'high' } })
          }
          console.log(`${tag} Route 3: Downloaded ${label}:`, { name, bytes: buf.length, mime })
          return { fileContents, textBackup }
        }

        // Download all three documents
        const billData = await downloadAndPrepare(bill_storage_path, 'VET BILL')
        const eobData = await downloadAndPrepare(eob_storage_path, 'EOB')

        // Download saved policy PDF
        const policyData = { fileContents: [], textBackup: [] }
        if (savedPolicy?.storage_path) {
          try {
            const p = await downloadAndPrepare(savedPolicy.storage_path, 'SAVED POLICY')
            policyData.fileContents = p.fileContents
            policyData.textBackup = p.textBackup
          } catch (e) {
            console.warn(`${tag} Route 3: Policy PDF download failed:`, e.message)
          }
        }


        // ── Route 3: Run shared Stage 1 (vet bill extraction) ──
        const stage1Result = await pciqRunStage1({
          openai, tag,
          vetBillFileContents: billData.fileContents,
          vetBillTextBackup: billData.textBackup,
        })

        // ── Route 3 Stage 2: Extract EOB data ──
        const r3EobPrompt = `You are an insurance EOB (Explanation of Benefits) parser. Extract all data from the attached EOB document.

EOB TEXT BACKUP (may be incomplete — always prefer the attached document):
${eobData.textBackup.join('\n\n') || '(No text backup available)'}

EXTRACTION RULES:
1. Extract EVERY line item from the EOB — what was submitted, what was allowed, what was paid, and what was denied.
2. For each denied or reduced item, extract the EXACT denial reason given on the EOB.
3. Classify each denial into one of these categories:
   - "deductible" — amount applied to annual deductible (normal)
   - "coinsurance" — pet owner's share based on reimbursement rate (normal)
   - "excluded" — item explicitly excluded from coverage
   - "not_covered" — item not covered under the policy
   - "waiting_period" — denied due to waiting period
   - "pre_existing" — denied as pre-existing condition
   - "limit_reached" — annual or per-incident limit reached
   - "covered" — item was fully covered and paid
   - "other" — any other reason

UNDERWRITER-TO-BRAND MAPPINGS (always use the brand name):
- "Westchester Fire Insurance Company" = "Healthy Paws"
- "United States Fire Insurance Company" = "Pumpkin"
- "American Pet Insurance Company" = "Fetch"
- "Independence American Insurance Company" = "Figo"
- "National Casualty Company" = "Nationwide Pet Insurance"

Return ONLY this JSON object:
{
  "petInfo": { "name": string | null, "species": string | null },
  "carrier": string | null,
  "claimNumber": string | null,
  "serviceDate": string | null,
  "totalSubmitted": number,
  "totalAllowed": number,
  "totalPaid": number,
  "totalDenied": number,
  "deductibleApplied": number,
  "coinsuranceApplied": number,
  "lineItems": [
    {
      "description": string,
      "amount_submitted": number,
      "amount_allowed": number,
      "amount_paid": number,
      "amount_denied": number,
      "denial_reason": string | null,
      "denial_category": string,
      "insurer_explanation": string | null
    }
  ]
}

IMPORTANT: Use numbers not strings for amounts. Return ONLY the JSON object.`

        console.log(`${tag} Route 3 Stage 2: Extracting EOB data...`)
        const r3Stage2Completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an insurance EOB parser. Extract data accurately and return valid JSON only.' },
            { role: 'user', content: [{ type: 'text', text: r3EobPrompt }, ...eobData.fileContents] }
          ],
          temperature: 0.1,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        })

        let r3EobResult = null
        try {
          let c = (r3Stage2Completion.choices?.[0]?.message?.content ?? '').trim()
          if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
          r3EobResult = JSON.parse(c)
        } catch {
          const m = (r3Stage2Completion.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
          if (m) { try { r3EobResult = JSON.parse(m[0]) } catch {} }
        }
        if (!r3EobResult) {
          return res.status(422).json({ error: 'Failed to extract EOB data. Please try again.' })
        }
        console.log(`${tag} Route 3 Stage 2 complete:`, {
          carrier: r3EobResult.carrier,
          totalPaid: r3EobResult.totalPaid,
          totalDenied: r3EobResult.totalDenied,
          lineItems: r3EobResult.lineItems?.length
        })

        // ── Route 3: Run shared Stage 2 (coverage analysis) ──
        const coverageResult = await pciqRunStage2({
          openai, tag,
          stage1Result,
          policyFileContents: policyData.fileContents,
          policyTextBackup: policyData.textBackup,
          savedPolicy,
          vetBillTextBackup: billData.textBackup,
        })

        // ── Route 3: Compare coverage analysis with EOB payment ──
        const eobActualPaid = r3EobResult.totalPaid || 0
        const eobDeductibleApplied = r3EobResult.deductibleApplied || 0
        const coveredTotal = coverageResult.covered_total || 0

        // Match coverage line items with EOB line items
        const eobItems = r3EobResult.lineItems || []
        const r3LineItems = (coverageResult.line_items || []).map(item => {
          const firstWord = (item.description || '').split(' ')[0].toLowerCase()
          const eobMatch = eobItems.find(e =>
            (e.description || '').toLowerCase().includes(firstWord) ||
            Math.abs((e.amount_submitted || 0) - item.amount) < 0.01
          )
          return {
            ...item,
            eob_paid: eobMatch ? (eobMatch.amount_paid ?? null) : null,
            eob_denied: eobMatch ? (eobMatch.amount_denied ?? null) : null,
            appeal_recommended: !!(item.covered && eobMatch && eobMatch.amount_denied > 0),
          }
        })

        // Build disputed items list
        const disputedItems = r3LineItems
          .filter(item => item.covered && item.eob_denied > 0)
          .map(item => ({
            description: item.description,
            amount: item.amount,
            denial_reason: 'Denied by insurer',
            policy_citation: item.policy_section || null,
          }))

        // ── Route 3: Compute corrected reimbursement (same math as compare-eob) ──
        const eobRate = coverageResult.reimbursement_rate || (savedPolicy?.reimbursement_rate) || null
        const rateForCalc = eobRate || 80
        const mathOrder = coverageResult.math_order || savedPolicy?.math_order || 'reimbursement-first'
        const isCoinsuranceFirst = mathOrder === 'reimbursement_first' || mathOrder === 'reimbursement-first'
        let correctedReimbursement
        if (isCoinsuranceFirst) {
          correctedReimbursement = Math.max(0, (coveredTotal * rateForCalc / 100) - eobDeductibleApplied)
        } else {
          correctedReimbursement = Math.max(0, (coveredTotal - eobDeductibleApplied) * rateForCalc / 100)
        }
        correctedReimbursement = Math.round(correctedReimbursement * 100) / 100
        const realShortfall = Math.max(0, Math.round((correctedReimbursement - eobActualPaid) * 100) / 100)
        const appealRecommended = realShortfall > 1  // >$1 threshold, same as compare-eob

        console.log(`${tag} Route 3 EOB math:`, {
          coveredTotal, eobActualPaid, eobDeductibleApplied,
          rate: rateForCalc, mathOrder, isCoinsuranceFirst,
          correctedReimbursement, realShortfall, appealRecommended,
        })

        // ── Route 3: Save analysis to DB (server-side — skips mobile save) ──
        let serviceDate = null
        const rawDate = coverageResult.visit_date || r3EobResult.serviceDate || null
        if (rawDate) {
          const d = new Date(rawDate)
          if (!isNaN(d.getTime())) serviceDate = d.toISOString().slice(0, 10)
        }
        let filingDeadline = null
        if (serviceDate && coverageResult.filing_deadline_days) {
          const d = new Date(serviceDate)
          d.setDate(d.getDate() + coverageResult.filing_deadline_days)
          if (!isNaN(d.getTime())) filingDeadline = d.toISOString().slice(0, 10)
        }

        const r3Status = appealRecommended ? 'disputed' : 'analyzed'
        const r3LineItemsPayload = {
          items: r3LineItems,
          pet_name: coverageResult.pet_name || (r3EobResult.petInfo && r3EobResult.petInfo.name) || null,
          carrier: coverageResult.carrier || r3EobResult.carrier || null,
          visit_type: coverageResult.visit_type || null,
          covered_total: coveredTotal,
          // EOB comparison fields (same as compare-eob route stores)
          eob_disputed_items: disputedItems,
          eob_discrepancy: realShortfall,
          eob_actual_paid: eobActualPaid,
          eob_deductible_applied: eobDeductibleApplied,
          eob_reimbursement_rate_used: eobRate,
          eob_insurer_eligible_amount: r3EobResult.totalAllowed || null,
          eob_corrected_reimbursement: correctedReimbursement,
          eob_storage_path: eob_storage_path,
          summary: coverageResult.summary || null,
          summary_scenario: coverageResult.summary_scenario || null,
        }

        const { data: savedAnalysis, error: saveError } = await supabase
          .from('pciq_analyses')
          .insert({
            user_id,
            policy_id: policy_id || null,
            analysis_type: 'both',
            clinic_name: coverageResult.clinic_name || null,
            service_date: serviceDate,
            total_bill: coverageResult.total_bill || 0,
            estimated_reimbursement: correctedReimbursement,
            actual_payment: eobActualPaid,
            status: r3Status,
            line_items: r3LineItemsPayload,
            filing_deadline: filingDeadline,
          })
          .select('id')
          .single()

        if (saveError) {
          console.error(`${tag} Route 3 DB save error:`, saveError.message)
        } else {
          console.log(`${tag} Route 3 saved to DB: id=${savedAnalysis.id} status=${r3Status}`)
        }

        // ── Route 3: Build mobile response ──
        const r3MobileResponse = {
          ...coverageResult,
          // Override with EOB-aware fields
          visit_date: coverageResult.visit_date || r3EobResult.serviceDate || null,
          pet_name: coverageResult.pet_name || (r3EobResult.petInfo && r3EobResult.petInfo.name) || null,
          carrier: coverageResult.carrier || r3EobResult.carrier || null,
          deductible_used: eobDeductibleApplied,
          line_items: r3LineItems,
          // EOB-grounded reimbursement (overrides Stage 2 estimate)
          estimated_reimbursement: correctedReimbursement,
          estimated_reimbursement_actual: correctedReimbursement,
          eob_corrected_reimbursement: correctedReimbursement,
          eob_actual_paid: eobActualPaid,
          // Route 3 specific fields
          appeal_recommended: appealRecommended,
          total_paid_by_insurer: eobActualPaid,
          total_underpaid: realShortfall,
          disputed_items: disputedItems,
          // Server-side save ID — tells mobile to skip its own save
          saved_id: savedAnalysis?.id || null,
          status: r3Status,
        }

        console.log(`${tag} ✅ Route 3 (Bill+EOB) complete:`, {
          total_bill: r3MobileResponse.total_bill,
          total_paid_by_insurer: r3MobileResponse.total_paid_by_insurer,
          total_underpaid: r3MobileResponse.total_underpaid,
          appeal_recommended: r3MobileResponse.appeal_recommended,
          corrected_reimbursement: correctedReimbursement,
          visit_type: r3MobileResponse.visit_type,
          line_items: r3MobileResponse.line_items.length,
          confidence: r3MobileResponse.confidence,
          saved_id: r3MobileResponse.saved_id,
          status: r3Status,
        })

        return res.json(r3MobileResponse)
      }
      // ═══════════════════════════════════════════════════════════════
      // END ROUTE 3 — Routes 1 & 2 continue below
      // ═══════════════════════════════════════════════════════════════

      // STEP 1 — Download from Supabase Storage
      const { data: blob, error: downloadError } = await supabase.storage
        .from('pciq-policies')
        .download(storage_path)

      if (downloadError) {
        console.error(`${tag} Download error:`, downloadError.message)
        return res.status(500).json({ error: downloadError.message })
      }

      const fileBuffer = Buffer.from(await blob.arrayBuffer())
      const fileName = storage_path.split('/').pop() || 'document.pdf'
      const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf'
        : /\.(jpe?g)$/i.test(fileName) ? 'image/jpeg'
        : fileName.toLowerCase().endsWith('.png') ? 'image/png'
        : 'application/pdf'

      console.log(`${tag} Downloaded:`, { fileName, bytes: fileBuffer.length, mimeType })

      // STEP 2 — Build file content arrays based on doc_type
      const vetBillFileContents = []
      const vetBillTextBackup = []
      const policyFileContents = []
      const policyTextBackup = []

      const isFilePdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

      const addFile = async (contentsArr, textArr, label) => {
        if (isFilePdf) {
          contentsArr.push(pciqPdfToFileInput(fileBuffer, fileName))
          const text = await pciqExtractPdfText(fileBuffer, fileName)
          textArr.push(`=== ${label} (text backup) ===\n${text}`)
        } else {
          contentsArr.push({ type: 'image_url', image_url: { url: pciqToDataUrl(fileBuffer, mimeType), detail: 'high' } })
        }
      }

      // 'bill'  → vet bill only; inject saved policy PDF if available
      // 'eob'   → EOB-only pipeline (returns early in Route 2 above)
      // 'both'  → returns early in Route 3 above — never reaches here
      if (doc_type === 'bill') {
        await addFile(vetBillFileContents, vetBillTextBackup, 'VET BILL')
        // Inject saved policy PDF if the user's policy has one stored
        if (savedPolicy?.storage_path) {
          const { data: policyBlob, error: policyDlErr } = await supabase.storage
            .from('pciq-policies')
            .download(savedPolicy.storage_path)
          if (policyDlErr) {
            console.warn(`${tag} Policy PDF download failed:`, policyDlErr.message)
          } else {
            const policyBuf = Buffer.from(await policyBlob.arrayBuffer())
            const policyFileName = savedPolicy.storage_path.split('/').pop() || 'policy.pdf'
            const isPolicyPdf = /\.pdf$/i.test(policyFileName)
            if (isPolicyPdf) {
              policyFileContents.push(pciqPdfToFileInput(policyBuf, policyFileName))
              const policyText = await pciqExtractPdfText(policyBuf, policyFileName)
              policyTextBackup.push(`=== SAVED POLICY DOCUMENT ===\n${policyText}`)
            } else {
              policyFileContents.push({ type: 'image_url', image_url: { url: pciqToDataUrl(policyBuf, 'image/jpeg'), detail: 'high' } })
            }
            console.log(`${tag} Injected saved policy PDF:`, policyFileName)
          }
        }
      } else if (doc_type === 'eob') {
        // ═══════════════════════════════════════════════════════════════
        // ROUTE 2 — EOB-only analysis (completely separate pipeline)
        // Downloads EOB + saved policy, classifies denials, reviews against policy
        // Returns early — never falls through to the bill/both Stage 1 & 2
        // ═══════════════════════════════════════════════════════════════

        // Build EOB file arrays
        const eobFileContents = []
        const eobTextBackup = []
        const eobPolicyContents = []
        const eobPolicyTextBackup = []

        // Add the uploaded EOB
        if (isFilePdf) {
          eobFileContents.push(pciqPdfToFileInput(fileBuffer, fileName))
          const text = await pciqExtractPdfText(fileBuffer, fileName)
          eobTextBackup.push(`=== EOB DOCUMENT ===\n${text}`)
        } else {
          eobFileContents.push({ type: 'image_url', image_url: { url: pciqToDataUrl(fileBuffer, mimeType), detail: 'high' } })
        }

        // Download saved policy PDF for comparison (same pattern as bill route)
        if (savedPolicy?.storage_path) {
          const { data: policyBlob, error: policyDlErr } = await supabase.storage
            .from('pciq-policies')
            .download(savedPolicy.storage_path)
          if (policyDlErr) {
            console.warn(`${tag} EOB route: Policy PDF download failed:`, policyDlErr.message)
          } else {
            const policyBuf = Buffer.from(await policyBlob.arrayBuffer())
            const policyFileName = savedPolicy.storage_path.split('/').pop() || 'policy.pdf'
            const isPolicyPdf = /\.pdf$/i.test(policyFileName)
            if (isPolicyPdf) {
              eobPolicyContents.push(pciqPdfToFileInput(policyBuf, policyFileName))
              const policyText = await pciqExtractPdfText(policyBuf, policyFileName)
              eobPolicyTextBackup.push(`=== SAVED POLICY DOCUMENT ===\n${policyText}`)
            } else {
              eobPolicyContents.push({ type: 'image_url', image_url: { url: pciqToDataUrl(policyBuf, 'image/jpeg'), detail: 'high' } })
            }
            console.log(`${tag} EOB route: Injected saved policy PDF:`, policyFileName)
          }
        }

        // ── EOB Stage 1: Extract EOB data and classify denials ──
        const eobExtractionPrompt = `You are an insurance EOB (Explanation of Benefits) parser. Extract all data from the attached EOB document.

EOB TEXT BACKUP (may be incomplete — always prefer the attached document):
${eobTextBackup.join('\n\n') || '(No text backup available)'}

EXTRACTION RULES:
1. Extract EVERY line item from the EOB — what was submitted, what was allowed, what was paid, and what was denied or reduced.
2. For each denied or reduced item, extract the EXACT denial/reduction reason given on the EOB.
3. Classify each denial into one of these categories:
   - "deductible" — amount applied to annual deductible (normal, not a dispute)
   - "coinsurance" — pet owner's share based on reimbursement rate (normal, not a dispute)
   - "excluded" — item explicitly excluded from coverage
   - "not_covered" — item not covered under the policy
   - "waiting_period" — denied due to waiting period not yet elapsed
   - "pre_existing" — denied as pre-existing condition
   - "limit_reached" — annual or per-incident limit reached
   - "covered" — item was fully covered and paid
   - "other" — any other reason
4. Amounts: use the amounts shown on the EOB for each column.
5. "amount_submitted" = what the vet charged / amount billed
6. "amount_allowed" = what the insurer considers eligible (if shown; otherwise use amount_submitted)
7. "amount_paid" = what the insurer actually paid
8. "amount_denied" = what was not paid

UNDERWRITER-TO-BRAND MAPPINGS (always use the brand name, never the underwriter):
- "Westchester Fire Insurance Company" = "Healthy Paws"
- "United States Fire Insurance Company" = "Pumpkin"
- "American Pet Insurance Company" = "Fetch"
- "Independence American Insurance Company" = "Figo"
- "National Casualty Company" = "Nationwide Pet Insurance"

Return ONLY this JSON object:
{
  "petInfo": {
    "name": string | null,
    "species": string | null
  },
  "carrier": string | null,
  "claimNumber": string | null,
  "claimDate": string | null,
  "serviceDate": string | null,
  "totalSubmitted": number,
  "totalAllowed": number,
  "totalPaid": number,
  "totalDenied": number,
  "deductibleApplied": number,
  "coinsuranceApplied": number,
  "lineItems": [
    {
      "description": string,
      "amount_submitted": number,
      "amount_allowed": number,
      "amount_paid": number,
      "amount_denied": number,
      "denial_reason": string | null,
      "denial_category": "deductible" | "coinsurance" | "excluded" | "not_covered" | "waiting_period" | "pre_existing" | "limit_reached" | "covered" | "other",
      "insurer_explanation": string | null
    }
  ]
}

IMPORTANT: Use numbers not strings for amounts. Return ONLY the JSON object.`

        console.log(`${tag} EOB Stage 1: Extracting EOB data...`, { files: eobFileContents.length })

        const eobStage1Completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an insurance EOB parser. Extract data accurately and return valid JSON only.' },
            { role: 'user', content: [{ type: 'text', text: eobExtractionPrompt }, ...eobFileContents] }
          ],
          temperature: 0.1,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        })

        const eobStage1Content = eobStage1Completion.choices?.[0]?.message?.content ?? ''
        let eobStage1Result = null
        try {
          let c = eobStage1Content.trim()
          if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
          eobStage1Result = JSON.parse(c)
        } catch {
          const m = eobStage1Content.match(/\{[\s\S]*\}/)
          if (m) { try { eobStage1Result = JSON.parse(m[0]) } catch {} }
        }

        if (!eobStage1Result) {
          console.error(`${tag} EOB Stage 1 failed to parse:`, eobStage1Content.substring(0, 500))
          return res.status(422).json({ error: 'Failed to extract EOB data. Please try again.' })
        }

        console.log(`${tag} EOB Stage 1 complete:`, {
          carrier: eobStage1Result.carrier,
          lineItems: eobStage1Result.lineItems?.length,
          totalSubmitted: eobStage1Result.totalSubmitted,
          totalPaid: eobStage1Result.totalPaid,
          totalDenied: eobStage1Result.totalDenied
        })

        // ── EOB Stage 2: Compare denials against policy rules ──
        let eobPolicyContext = ''
        if (savedPolicy) {
          eobPolicyContext = `
SAVED POLICY PARAMETERS (from user's account — use as ground truth when policy documents are absent or incomplete):
  Carrier: ${savedPolicy.carrier || 'Unknown'}
  Pet Name: ${savedPolicy.pet_name || 'Unknown'}
  Species: ${savedPolicy.species || 'Unknown'}
  Deductible: $${savedPolicy.deductible ?? 'Unknown'}
  Reimbursement Rate: ${savedPolicy.reimbursement_rate != null ? savedPolicy.reimbursement_rate + '%' : 'Unknown'}
  Annual Limit: ${savedPolicy.annual_limit != null ? '$' + savedPolicy.annual_limit : 'Unknown'}
  Math Order: ${savedPolicy.math_order || 'Unknown'}
  Effective Date: ${savedPolicy.effective_date || 'Unknown'}
  Exclusions: ${(savedPolicy.exclusions || []).join(', ') || 'None listed'}
  Policy Notes: ${savedPolicy.policy_text || 'None'}
`
        }

        const eobReviewPrompt = `You are a pet insurance claims reviewer. An EOB (Explanation of Benefits) has been parsed in Stage 1. Your job is to review each denial and determine if it was handled correctly according to the policy.

EOB EXTRACTION (from Stage 1 — treat as ground truth):
${JSON.stringify(eobStage1Result, null, 2)}
${eobPolicyContext}
${eobPolicyTextBackup.length > 0 ? `Policy documents are attached. Examine each one carefully.\n\nPOLICY TEXT BACKUP:\n${eobPolicyTextBackup.join('\n\n')}` : '(No policy documents available — use saved policy parameters above)'}

REVIEW EACH LINE ITEM:

For items denied as "excluded", "not_covered", "waiting_period", or "pre_existing":
1. Check if the policy actually excludes this item
2. Check if the denial reason is valid per the policy terms
3. Flag items that appear WRONGLY DENIED — set appeal_recommended: true

For items with "deductible" or "coinsurance" applied:
1. Verify the deductible amount matches the policy terms
2. Verify the coinsurance percentage matches the policy terms
3. Flag discrepancies

For items marked "covered":
1. Verify the paid amount seems correct
2. These are fine — set appeal_recommended: false

IMPORTANT RULES:
- Deductible and coinsurance applications are usually correct — only flag if amounts don't match policy
- Focus on coverage denials that may be incorrect
- If no policy documents are available, note that review is limited but still flag obviously wrong denials
- Be specific about WHY you think a denial is wrong (cite policy section if possible)
- Pet insurance covers on an EXCLUSION basis: medically necessary treatment IS covered unless explicitly excluded

Return ONLY this JSON object:
{
  "completeness": "full" | "partial" | "eob_only",
  "policyInfo": {
    "carrier": string | null,
    "reimbursementRate": number | null,
    "deductible": number | null,
    "annualLimit": number | null,
    "mathOrder": "reimbursement-first" | "deductible-first" | null
  },
  "analysis": {
    "lineItems": [
      {
        "description": string,
        "amount": number,
        "covered": true | false | null,
        "reason": string,
        "sourceQuote": string | null,
        "section": string | null,
        "eob_paid": number,
        "eob_denied": number,
        "denial_correct": true | false | null,
        "appeal_recommended": boolean
      }
    ],
    "totalBill": number,
    "totalCovered": number,
    "totalExcluded": number,
    "totalPaidByInsurer": number,
    "totalUnderpaid": number,
    "maxReimbursement": number,
    "shouldFile": boolean,
    "shouldFileReason": string,
    "appealRecommended": boolean,
    "appealReason": string | null,
    "eligibilityWarnings": [],
    "disputedItems": []
  }
}

For each lineItem:
- "amount" = amount_submitted from the EOB
- "covered" = true if the item should be covered (whether or not insurer actually paid)
- "reason" = explanation of your coverage determination
- "appeal_recommended" = true if this item appears wrongly denied and should be appealed
- "eob_paid" = what insurer actually paid for this item
- "eob_denied" = what insurer denied for this item

IMPORTANT: Use numbers not strings for amounts. reimbursementRate must be an integer (80 not 0.80). Return ONLY the JSON object.`

        console.log(`${tag} EOB Stage 2: Reviewing denials against policy...`, {
          policyFiles: eobPolicyContents.length,
          hasSavedPolicy: !!savedPolicy
        })

        const eobStage2Completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a pet insurance claims reviewer. Analyze denials carefully and return valid JSON.' },
            { role: 'user', content: [{ type: 'text', text: eobReviewPrompt }, ...eobPolicyContents] }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        })

        const eobStage2Content = eobStage2Completion.choices?.[0]?.message?.content ?? ''
        let eobStage2Result = null
        try {
          let c = eobStage2Content.trim()
          if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
          eobStage2Result = JSON.parse(c)
        } catch {
          const m = eobStage2Content.match(/\{[\s\S]*\}/)
          if (m) { try { eobStage2Result = JSON.parse(m[0]) } catch {} }
        }

        if (!eobStage2Result) {
          console.error(`${tag} EOB Stage 2 failed to parse:`, eobStage2Content.substring(0, 500))
          return res.status(422).json({ error: 'Failed to review EOB denials. Please try again.' })
        }

        const eobS2a = eobStage2Result.analysis || {}
        const eobS2p = eobStage2Result.policyInfo || {}

        console.log(`${tag} EOB Stage 2 complete:`, {
          completeness: eobStage2Result.completeness,
          totalPaidByInsurer: eobS2a.totalPaidByInsurer,
          totalUnderpaid: eobS2a.totalUnderpaid,
          appealRecommended: eobS2a.appealRecommended,
          lineItems: eobS2a.lineItems?.length
        })

        // ── Co-insurance safety net (EOB route) ──
        if (eobS2p.reimbursementRate != null && eobS2p.rateIsCoinsurance === true) {
          const raw = eobS2p.reimbursementRate
          if (raw <= 30) {
            eobS2p.reimbursementRate = 100 - raw
            console.log(`${tag} EOB co-insurance safety net: converted ${raw}% → ${eobS2p.reimbursementRate}%`)
          }
        }

        // ── EOB: Recalculate reimbursement server-side ──
        const eobTotalCovered = eobS2a.totalCovered || 0
        const eobRateRaw = (savedPolicy?.reimbursement_rate ?? eobS2p.reimbursementRate) || null
        const eobDeductible = (savedPolicy?.deductible ?? eobS2p.deductible) || 0
        const eobMathOrder = (savedPolicy?.math_order ?? eobS2p.mathOrder) || 'reimbursement-first'

        let eobMaxReimbursement = eobS2a.maxReimbursement || 0
        if (eobTotalCovered > 0 && eobRateRaw) {
          const rate = eobRateRaw / 100
          eobMaxReimbursement = eobMathOrder === 'deductible-first'
            ? (eobTotalCovered - eobDeductible) * rate
            : (eobTotalCovered * rate) - eobDeductible
          eobMaxReimbursement = Math.round(Math.max(0, eobMaxReimbursement) * 100) / 100
        }

        const eobShouldFile = eobS2a.appealRecommended ?? eobS2a.shouldFile ?? false
        const eobRecommendation = eobShouldFile ? 'file' : 'skip'

        const eobReimbursementIfDeductibleMet = (eobTotalCovered > 0 && eobRateRaw)
          ? Math.round(eobTotalCovered * (eobRateRaw / 100) * 100) / 100
          : 0

        // ── EOB: Map to mobile response shape (same structure as bill route) ──
        const eobMobileResponse = {
          estimated_reimbursement: eobMaxReimbursement,
          total_bill: eobS2a.totalBill || eobStage1Result.totalSubmitted || 0,
          recommendation: eobRecommendation,
          line_items: (eobS2a.lineItems || []).map(item => ({
            description: item.description,
            amount: item.amount,
            covered: item.covered ?? false,
            reason: item.reason || '',
            source_quote: item.sourceQuote || '',
            policy_section: item.sourceQuote || item.section || null,
            eob_paid: item.eob_paid ?? null,
            eob_denied: item.eob_denied ?? null,
            appeal_recommended: item.appeal_recommended ?? false,
          })),
          // EOB doesn't classify visit type — that's a bill-only concept
          visit_type: null,
          clinic_name: null,
          visit_date: eobStage1Result.serviceDate || null,
          pet_name: eobStage1Result.petInfo?.name || savedPolicy?.pet_name || null,
          confidence: (() => {
            const hasFullPolicy = savedPolicy && savedPolicy.deductible != null && savedPolicy.reimbursement_rate != null
            const allItemsClassified = (eobS2a.lineItems || eobS2a.disputedItems || []).every(item => item.covered === true || item.covered === false || item.appeal_recommended != null)
            if (hasFullPolicy && allItemsClassified) return 'High'
            if (savedPolicy || eobStage2Result.completeness === 'full') {
              if (!allItemsClassified) return 'Medium'
              return 'High'
            }
            if (eobStage2Result.completeness === 'partial') return 'Medium'
            return 'Low'
          })(),
          eligibility_warnings: eobS2a.eligibilityWarnings || [],
          carrier: savedPolicy?.carrier || eobStage1Result.carrier || eobS2p.carrier || null,
          deductible_total: eobDeductible,
          deductible_used: eobStage1Result.deductibleApplied || 0,
          reimbursement_rate: eobRateRaw,
          covered_total: eobTotalCovered,
          excluded_total: eobS2a.totalExcluded || 0,
          estimated_reimbursement_if_deductible_met: eobReimbursementIfDeductibleMet,
          estimated_reimbursement_actual: eobMaxReimbursement,
          should_file: eobShouldFile,
          should_file_reason: eobS2a.shouldFileReason || eobS2a.appealReason || '',
          filing_deadline_days: savedPolicy?.filing_deadline_days || null,
          math_order: eobMathOrder,
          // EOB-specific fields
          appeal_recommended: eobS2a.appealRecommended ?? false,
          total_paid_by_insurer: eobS2a.totalPaidByInsurer || eobStage1Result.totalPaid || 0,
          total_underpaid: eobS2a.totalUnderpaid || 0,
          disputed_items: eobS2a.disputedItems || [],
        }

        console.log(`${tag} ✅ EOB analysis complete:`, {
          total_bill: eobMobileResponse.total_bill,
          total_paid_by_insurer: eobMobileResponse.total_paid_by_insurer,
          total_underpaid: eobMobileResponse.total_underpaid,
          appeal_recommended: eobMobileResponse.appeal_recommended,
          line_items: eobMobileResponse.line_items.length,
          confidence: eobMobileResponse.confidence,
        })

        return res.json(eobMobileResponse)
        // ═══════════════════════════════════════════════════════════════
        // END ROUTE 2 — bill/both routes continue below
        // ═══════════════════════════════════════════════════════════════
      }
      // Route 3 (both) returns early above — only bill route reaches here


      // STEP 3 — Run Stage 1 + Stage 2 via shared helpers
      const stage1Result = await pciqRunStage1({ openai, tag, vetBillFileContents, vetBillTextBackup })
      const mobileResponse = await pciqRunStage2({ openai, tag, stage1Result, policyFileContents, policyTextBackup, savedPolicy, vetBillTextBackup })

      console.log(`${tag} ✅ Complete:`, {
        total_bill: mobileResponse.total_bill,
        estimated_reimbursement: mobileResponse.estimated_reimbursement,
        recommendation: mobileResponse.recommendation,
        line_items: mobileResponse.line_items.length,
        confidence: mobileResponse.confidence,
        visit_type: mobileResponse.visit_type,
        carrier: mobileResponse.carrier,
      })

      return res.json(mobileResponse)

    } catch (error) {
      console.error(`[pciq/analyze] Error:`, error)
      if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        return res.status(504).json({ error: 'Analysis timed out. Please try again with a smaller file.' })
      }
      if (error.status === 429) {
        return res.status(429).json({ error: 'Service is busy. Please try again in a moment.' })
      }
      return res.status(500).json({ error: error.message || 'An unexpected error occurred.' })
    }
  })

  // ========================================
  // POST /api/pciq/extract-policy
  // Accepts a Supabase storage path to a policy PDF,
  // runs gpt-4o to extract structured policy fields,
  // and returns them for saving to pciq_policies.
  // ========================================
  app.post('/api/pciq/extract-policy', async (req, res) => {
    const tag = '[pciq/extract-policy]'
    try {
      // Auth
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }

      const { storage_path } = req.body || {}
      const user_id = user.id

      if (!storage_path) {
        return res.status(400).json({ error: 'storage_path is required' })
      }
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' })
      }

      console.log(`${tag} Request received`)

      // Download policy PDF from Supabase Storage
      const { data: blob, error: downloadError } = await supabase.storage
        .from('pciq-policies')
        .download(storage_path)

      if (downloadError) {
        console.error(`${tag} Download error:`, downloadError.message)
        return res.status(500).json({ error: downloadError.message })
      }

      const fileBuffer = Buffer.from(await blob.arrayBuffer())
      const fileName = storage_path.split('/').pop() || 'policy.pdf'
      const isPdf = /\.pdf$/i.test(fileName)

      console.log(`${tag} Downloaded: ${fileBuffer.length} bytes, isPdf=${isPdf}`)

      // Build file content for gpt-4o
      // PDFs: extract text and send as text block (gpt-4o doesn't support PDF file inputs)
      // Images: send as image_url
      let fileContents = []
      let policyText = ''
      if (isPdf) {
        policyText = await pciqExtractPdfText(fileBuffer, fileName)
        console.log(`${tag} Extracted ${policyText.length} chars of text from PDF`)
      } else {
        const mimeType = /\.(jpe?g)$/i.test(fileName) ? 'image/jpeg' : 'image/png'
        fileContents.push({ type: 'image_url', image_url: { url: pciqToDataUrl(fileBuffer, mimeType), detail: 'high' } })
      }

      const extractionPrompt = `You are a pet insurance policy expert. Extract all structured fields from the policy document text below.

POLICY DOCUMENT TEXT:
${policyText || '(No text extracted — see attached image)'}

EXTRACTION RULES:
1. REIMBURSEMENT RATE: Look for "Co-Insurance", "Coinsurance %", "Reimbursement Rate", "Insurer Pays". Return as plain integer (80 means 80%). Do NOT return 0.80.
   CRITICAL CO-INSURANCE CONVERSION — different carriers use "co-insurance" differently. You MUST apply the correct conversion:
   - Nationwide Pet Insurance: "Co-insurance" means the OWNER's share. Convert by subtracting from 100%. Example: "10% co-insurance" → reimbursement_rate = 90. Example: "20% co-insurance" → reimbursement_rate = 80.
   - Odie: "Co-Insurance" means the INSURER's share. Use the number directly. Example: "70% Co-Insurance" → reimbursement_rate = 70.
   - Pumpkin, Healthy Paws, Embrace, Fetch, or any carrier using "reimbursement rate" or "reimbursement level": Use the number directly. Example: "80% reimbursement rate" → reimbursement_rate = 80.
   - Figo (Independence American Insurance Company): Figo has two form generations — check for the form number at the bottom of pages:
     * "IAIC-PET-POL" (older form): "Coinsurance Amount" = what Figo pays. Extract directly. Example: "Coinsurance Amount: 70%" → reimbursement_rate = 70.
     * "IAIC FPI POL" (newer form): "Reimbursement Percentage" = what Figo pays. "Coinsurance" = what the OWNER pays. Extract the REIMBURSEMENT PERCENTAGE as the rate, NOT the coinsurance. Example: "80% Reimbursement Percentage" → reimbursement_rate = 80. Do NOT use the "20% Coinsurance" value.
     * If you see both "Reimbursement Percentage" and "Coinsurance" defined, ALWAYS use the Reimbursement Percentage.
   - Unknown carrier: Read the policy language carefully. If it says "you are responsible for X%" or "your share is X%" or "co-insurance X%", that's the owner's share — subtract from 100%. If it says "we pay X%" or "we reimburse X%", use directly.
   The reimbursement_rate field must ALWAYS represent the percentage the INSURER pays.
   FIGO-SPECIFIC RULES:
   - Figo exam fees are EXCLUDED by default unless the "Office Visit and Exam Fees" rider is shown on the Declarations Page. If this rider is absent, include "exam fees" in the exclusions array.
   - Figo may have a Per Incident Deductible instead of (or in addition to) an Annual Deductible. Extract whichever deductible is on the Declarations Page.
   - Figo has a Diminishing Deductible feature (deductible drops $50/year for claim-free years). Extract the current deductible value from the Declarations Page regardless.
   - Figo optional riders (Wellness, Rehab/Physical Therapy, Holistic/Alternative Care & Behavioral Problems) are ONLY active if shown on the Declarations Page. If absent, include them in the exclusions array.
2. ANNUAL DEDUCTIBLE: Look for "Annual Deductible", "Deductible", "Per Policy Period Deductible", "Per Incident Deductible". Return as plain number (no $ sign).
3. ANNUAL LIMIT: Look for "Annual Limit", "Policy Maximum", "Annual Maximum". Return as plain number or null if unlimited.
4. CARRIER: Use consumer-facing brand name (e.g., "Healthy Paws" not "Westchester Fire Insurance Company"). Brand mappings:
   - "Westchester Fire Insurance Company" = "Healthy Paws"
   - "United States Fire Insurance Company" = "Pumpkin"
   - "American Pet Insurance Company" = "Fetch"
   - "Independence American Insurance Company" = "Figo"
   - "National Casualty Company" = "Nationwide Pet Insurance"
5. PET NAME: from declarations page.
6. SPECIES: "dog" or "cat" (lowercase).
7. BREED: from declarations page or null.
8. MATH ORDER:
   - "reimbursement_first" = percentage applied first, then deductible subtracted
   - "deductible_first" = deductible subtracted first, then percentage applied
   - null if you cannot determine from a worked example or explicit statement
9. EFFECTIVE DATE: policy start date in YYYY-MM-DD format or null.
10. EXPIRATION DATE: policy end date in YYYY-MM-DD format or null.
11. FILING DEADLINE DAYS: number of days from service date to file a claim (e.g., 90), or null.
12. EXCLUSIONS: array of key exclusion categories as short strings (e.g., ["pre-existing conditions", "wellness", "elective procedures"]).
13. POLICY TEXT: a 1-3 sentence plain-English summary of what this policy covers.
14. POLICY NUMBER: Look for "Policy Number", "Policy No.", "Policy #", "Certificate Number". Return as a string exactly as printed, or null if not found.

Return ONLY this JSON object:
{
  "carrier": string | null,
  "pet_name": string | null,
  "species": "dog" | "cat" | null,
  "breed": string | null,
  "deductible": number | null,
  "reimbursement_rate": number | null,
  "annual_limit": number | null,
  "math_order": "reimbursement_first" | "deductible_first" | null,
  "effective_date": string | null,
  "expiration_date": string | null,
  "filing_deadline_days": number | null,
  "exclusions": string[],
  "policy_text": string | null,
  "policy_number": string | null
}

IMPORTANT: Return ONLY the JSON object. Numbers must be numbers, not strings.`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a pet insurance policy extraction specialist. Extract data accurately and return valid JSON only.' },
          { role: 'user', content: [{ type: 'text', text: extractionPrompt }, ...fileContents] }
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })

      const rawContent = completion.choices?.[0]?.message?.content ?? ''
      console.log(`${tag} OpenAI response: ${rawContent.length} chars`)
      let extracted = null
      try {
        let c = rawContent.trim()
        if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
        extracted = JSON.parse(c)
      } catch {
        const m = rawContent.match(/\{[\s\S]*\}/)
        if (m) { try { extracted = JSON.parse(m[0]) } catch {} }
      }

      console.log(`${tag} Parsed: ${extracted ? 'success' : 'failed'}`)

      if (!extracted) {
        console.error(`${tag} Failed to parse response:`, rawContent.substring(0, 500))
        return res.status(422).json({ error: 'Failed to extract policy data. Please try again.' })
      }

      console.log(`${tag} ✅ Extracted: has_carrier=${!!extracted.carrier} has_deductible=${extracted.deductible != null} has_rate=${extracted.reimbursement_rate != null} math_order=${extracted.math_order}`)

      // Normalize math_order to match DB enum (reimbursement_first → reimbursement_first)
      if (extracted.math_order === 'reimbursement-first') extracted.math_order = 'reimbursement_first'
      if (extracted.math_order === 'deductible-first') extracted.math_order = 'deductible_first'

      // ── Co-insurance safety net ──
      // If a carrier returns a very low rate (≤30%), GPT likely returned the
      // owner's co-insurance share instead of converting. Fix it server-side.
      if (extracted.reimbursement_rate != null && extracted.reimbursement_rate <= 30) {
        const carrierLower = (extracted.carrier || '').toLowerCase()
        if (carrierLower.includes('nationwide') || carrierLower.includes('figo')) {
          const original = extracted.reimbursement_rate
          extracted.reimbursement_rate = 100 - original
          console.log(`${tag} ⚠ Co-insurance safety net: ${extracted.carrier} ${original}% → ${extracted.reimbursement_rate}% reimbursement rate`)
        }
      }

      return res.json({ ...extracted, storage_path })

    } catch (error) {
      console.error(`${tag} Error:`, error.message)
      return res.status(500).json({ error: error.message || 'An unexpected error occurred.' })
    }
  })

  // ─── Compare EOB ────────────────────────────────────────────────────────────

  app.post('/api/pciq/compare-eob', async (req, res) => {
    const tag = '[compare-eob]'
    try {
      // Auth
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }

      const { claim_id, eob_storage_path, original_line_items } = req.body

      console.log(`${tag} claim_id=${claim_id} items=${(original_line_items || []).length}`)

      if (!eob_storage_path) {
        return res.status(400).json({ error: 'Missing eob_storage_path' })
      }

      // Download EOB from Supabase Storage
      const { data: blob, error: downloadError } = await supabase.storage
        .from('pciq-policies')
        .download(eob_storage_path)

      if (downloadError) {
        console.error(`${tag} Download error:`, downloadError.message)
        return res.status(500).json({ error: downloadError.message })
      }

      const fileBuffer = Buffer.from(await blob.arrayBuffer())
      const fileName = eob_storage_path.split('/').pop() || 'eob.pdf'
      const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf'
        : /\.(jpe?g)$/i.test(fileName) ? 'image/jpeg'
        : fileName.toLowerCase().endsWith('.png') ? 'image/png'
        : 'application/pdf'
      const base64Data = fileBuffer.toString('base64')

      console.log(`${tag} Downloaded EOB:`, { fileName, bytes: fileBuffer.length, mimeType })

      // Build the original line items summary for GPT (covered items with policy citations)
      const items = original_line_items?.items || []

      // 🔍 DIAGNOSTIC: Dump raw fields of first 3 items to trace policy citation data
      console.log(`${tag} 🔍 Original line items count: ${items.length}`)
      items.slice(0, 3).forEach((item, idx) => {
        console.log(`${tag} 🔍 Item[${idx}] ALL KEYS: ${Object.keys(item).join(', ')}`)
        console.log(`${tag} 🔍 Item[${idx}] description="${item.description}" covered=${item.covered} amount=${item.amount}`)
        console.log(`${tag} 🔍 Item[${idx}] reason="${item.reason || 'NONE'}"`)
        console.log(`${tag} 🔍 Item[${idx}] policy_section="${item.policy_section || 'NONE'}"`)
        console.log(`${tag} 🔍 Item[${idx}] sourceQuote="${item.sourceQuote || 'NONE'}"`)
        console.log(`${tag} 🔍 Item[${idx}] section="${item.section || 'NONE'}"`)
        console.log(`${tag} 🔍 Item[${idx}] policy_citation="${item.policy_citation || 'NONE'}"`)
      })
      const originalSummary = items
        .filter(item => item.covered)
        .map((item, idx) => {
          let line = `${idx + 1}. ${item.description || 'Item'} — $${(item.amount || 0).toFixed(2)} (COVERED)`
          if (item.reason) line += `\n   Reason: ${item.reason}`
          if (item.policy_section) line += `\n   Policy citation: "${item.policy_section}"`
          return line
        }).join('\n')

      const excludedSummary = items
        .filter(item => !item.covered)
        .map((item, idx) => {
          return `${idx + 1}. ${item.description || 'Item'} — $${(item.amount || 0).toFixed(2)} (EXCLUDED)`
        }).join('\n')

      // Fetch the NET expected reimbursement from the DB (after deductible + coinsurance math).
      // This is the actual amount the insurer should have paid — NOT the raw sum of covered items.
      const coveredTotal = items.filter(i => i.covered).reduce((sum, i) => sum + (i.amount || 0), 0)
      let expectedReimbursement = coveredTotal  // fallback to covered total if DB value unavailable
      let dbPolicyId = null
      let dbMathOrder = null
      if (claim_id) {
        const { data: claimRow } = await supabase
          .from('pciq_analyses')
          .select('estimated_reimbursement, policy_id')
          .eq('id', claim_id)
          .single()
        if (claimRow?.estimated_reimbursement != null && claimRow.estimated_reimbursement > 0) {
          expectedReimbursement = claimRow.estimated_reimbursement
          console.log(`${tag} Using DB estimated_reimbursement=$${expectedReimbursement} (coveredTotal was $${coveredTotal.toFixed(2)})`)
        } else {
          console.warn(`${tag} ⚠ No estimated_reimbursement in DB, falling back to coveredTotal=$${coveredTotal.toFixed(2)}`)
        }
        dbPolicyId = claimRow?.policy_id || null
      }
      // Fetch math_order from policy so we can compute corrected reimbursement after EOB comparison
      if (dbPolicyId) {
        const { data: policyRow } = await supabase
          .from('pciq_policies')
          .select('math_order, carrier')
          .eq('id', dbPolicyId)
          .single()
        if (policyRow) {
          dbMathOrder = policyRow.math_order || null
          // Also check carrier for Healthy Paws coinsurance-first detection
          if (!dbMathOrder && (policyRow.carrier || '').toLowerCase().includes('healthy paws')) {
            dbMathOrder = 'reimbursement_first'
          }
        }
        console.log(`${tag} Policy math_order=${dbMathOrder}`)
      }

      const prompt = `You are a pet insurance claims auditor. You will be given:
1. An EOB (Explanation of Benefits) from an insurer
2. The original PCIQ line-by-line coverage predictions with policy citations
3. Our expected NET reimbursement (after deductible and coinsurance): $${expectedReimbursement.toFixed(2)}

Follow these steps IN THIS EXACT ORDER:

═══════════════════════════════════════════════════════════════
STEP 1 — FIND THE ACTUAL AMOUNT DISBURSED TO THE POLICYHOLDER
═══════════════════════════════════════════════════════════════
Search the EOB for the FINAL DISBURSEMENT amount — the real money being sent to the policyholder. Look for:
- "Amount Paid", "Amount Paid by [Carrier Name]", "Total Payment"
- "Check Amount", "Amount Disbursed", "Your Reimbursement"
- "Benefit Paid", "We Are Paying You", "Total Benefit"

⚠️  CRITICAL: EOBs show intermediate math steps ABOVE the final payment line. For example:
   Eligible charges: $706.66
   Less deductible: -$250.00
   Reimbursement at 80%: $364.93    ← THIS IS NOT THE ACTUAL PAYMENT
   Amount Paid by Carrier: $0.00     ← THIS IS THE ACTUAL PAYMENT

The ACTUAL PAYMENT is the FINAL disbursement line — the amount the insurer is really sending. It may be $0.00 even when the math above shows a positive number. You MUST find this final line, not the calculated reimbursement.

Record this number as "actual_paid_by_insurer".

═══════════════════════════════════════════════════════════════
STEP 2 — COMPARE ACTUAL PAID vs OUR EXPECTED REIMBURSEMENT
═══════════════════════════════════════════════════════════════
Our prior analysis predicted the policyholder should receive: $${expectedReimbursement.toFixed(2)}
Compare this to actual_paid_by_insurer from Step 1.
If they differ by more than $1.00, this claim is UNDERPAID.

═══════════════════════════════════════════════════════════════
STEP 3 — IDENTIFY DENIED/UNDERPAID ITEMS
═══════════════════════════════════════════════════════════════
For each item we predicted as covered, check the EOB to see if it was denied or underpaid.

TWO TYPES OF DENIALS:
1. DEDUCTIBLE DENIALS (VALID — do NOT flag these):
   - "applied to deductible", "deductible not yet met", "subject to annual deductible"
   - These are correct insurer behavior. The policyholder must meet their deductible first.
   - Even if PCIQ predicted the item was covered, a deductible denial is NOT a dispute.

2. COVERAGE DENIALS (DISPUTABLE — flag these):
   - "not a covered service", "excluded from coverage", "not medically necessary"
   - "requires pre-authorization", "waiting period not met", "breed-specific exclusion"
   - "cosmetic procedure", "experimental treatment", "pre-existing condition"
   - These are cases where the insurer says the policy does NOT cover the item at all.

IMPORTANT: If actual_paid_by_insurer is $0.00 (or near $0) but our prediction was $${expectedReimbursement.toFixed(2)}, then ALL covered items were effectively denied. Each covered item's insurer_paid should be $0.00 in that case.

ORIGINAL PCIQ PREDICTIONS — COVERED ITEMS:
${originalSummary || 'No covered items.'}

ORIGINAL PCIQ PREDICTIONS — EXCLUDED ITEMS (ignore these):
${excludedSummary || 'None.'}

Also extract the CARRIER NAME from the EOB — the insurance company that issued this EOB. Look for the company name in the header, letterhead, or "From" section. Use the consumer-facing brand name (e.g., "Pumpkin" not "United States Fire Insurance Company"). Return as "eob_carrier".

Also extract appeals contact information from the EOB. Most EOBs include an appeals section with an address, phone number, email, deadline, and/or claim reference number. Extract whatever is present — use null for any field not found. NEVER guess or fabricate contact info.

Also extract the insurer's own math from the EOB:
- The DEDUCTIBLE amount they applied (e.g., "Less annual deductible: $250.00" → 250)
- The REIMBURSEMENT RATE / coinsurance percentage they used (e.g., "Reimbursement at 80%" → 80)
- The ELIGIBLE AMOUNT before deductible/coinsurance (e.g., "Eligible charges: $1,825.00" → 1825)

Return ONLY a JSON object (no markdown, no commentary):
{
  "actual_paid_by_insurer": <the final disbursement amount found in Step 1>,
  "deductible_applied": <the deductible amount the insurer subtracted, or 0 if not shown>,
  "reimbursement_rate_used": <the coinsurance/reimbursement percentage as a whole number e.g. 80, or null if not shown>,
  "insurer_eligible_amount": <the total the insurer considered eligible before deductible/coinsurance, or null if not shown>,
  "status": "underpaid" | "correct" | "overpaid",
  "discrepancy": <difference between our expected NET reimbursement $${expectedReimbursement.toFixed(2)} and actual_paid_by_insurer, 0 if correct>,
  "disputed_items": [
    {
      "name": "<item name>",
      "pciq_predicted": <dollar amount PCIQ said should be covered>,
      "insurer_paid": <dollar amount actually disbursed for this item — use $0 if the total disbursement was $0>,
      "coverage_reason": "<exact coverage category from the original PCIQ analysis, e.g. 'Covered — other' or 'Covered — diagnostic test'. Copy verbatim from the Reason field above>",
      "policy_citation": "<exact policy language from original prediction>",
      "denial_reason": "<what the EOB said — must be a COVERAGE denial, not deductible>"
    }
  ],
  "appeals_email": "<email address for appeals, or null if not found>",
  "appeals_address": "<mailing address for appeals, or null if not found>",
  "appeals_phone": "<phone number for appeals, or null if not found>",
  "appeals_deadline": "<deadline text e.g. 'within 30 days of this notice', or null if not found>",
  "appeals_reference": "<claim/reference number to cite in appeal, or null if not found>",
  "eob_carrier": "<insurance company name from the EOB, or null if not found>"
}

Rules:
- STEP 1 is MANDATORY — you must find the actual disbursement amount before evaluating anything else
- If actual_paid_by_insurer differs from $${expectedReimbursement.toFixed(2)} by more than $1.00, status MUST be "underpaid" (or "overpaid" if they paid more)
- insurer_paid on each disputed item must reflect ACTUAL DISBURSEMENT, not intermediate math
- NEVER include deductible-related denials in disputed_items
- Only include genuine COVERAGE denials where the insurer says the item is not covered
- If ALL denials are deductible-related and there are no coverage disputes, return status: "correct"
- If the insurer paid MORE than predicted overall, return status: "overpaid" with discrepancy: 0 and empty disputed_items
- Only flag items that have a policy citation supporting coverage — items without citations are not disputable
- If you cannot read the EOB or cannot determine amounts, return {"status": "correct", "discrepancy": 0, "disputed_items": []}
- All numbers must be plain numbers, not strings`

      console.log(`${tag} Prompt built: ${prompt.length} chars`)

      // Build messages with image content
      const userContent = mimeType === 'application/pdf'
        ? [
            { type: 'text', text: prompt },
            { type: 'file', file: { filename: fileName, file_data: `data:${mimeType};base64,${base64Data}` } },
          ]
        : [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ]

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 2000,
        messages: [{ role: 'user', content: userContent }],
      })

      const raw = completion.choices[0]?.message?.content?.trim()
      console.log(`${tag} GPT response: ${(raw || '').length} chars`)

      if (!raw) throw new Error('Empty response from OpenAI')

      // Parse JSON — strip markdown fences if present
      const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
      const parsed = JSON.parse(jsonStr)

      // ── DIAGNOSTIC: full parsed GPT response ──
      console.log(`${tag} 🔍 FULL PARSED EOB RESPONSE:`, JSON.stringify(parsed, null, 2))
      console.log(`${tag} 🔍 parsed.actual_paid_by_insurer = ${JSON.stringify(parsed.actual_paid_by_insurer)} (type: ${typeof parsed.actual_paid_by_insurer})`)
      console.log(`${tag} 🔍 parsed.discrepancy = ${JSON.stringify(parsed.discrepancy)}`)
      console.log(`${tag} 🔍 parsed.status = ${JSON.stringify(parsed.status)}`)

      // ── Carrier mismatch detection ──
      // Compare the carrier on the EOB against the policy carrier from the DB
      const eobCarrier = parsed.eob_carrier || null
      let policyCarrier = null
      let carrierMismatchWarning = null
      if (dbPolicyId) {
        const { data: policyRow } = await supabase
          .from('pciq_policies')
          .select('carrier, policy_number')
          .eq('id', dbPolicyId)
          .single()
        policyCarrier = policyRow?.carrier || null
      }
      if (eobCarrier && policyCarrier) {
        const eobLower = eobCarrier.toLowerCase().trim()
        const policyLower = policyCarrier.toLowerCase().trim()
        if (!eobLower.includes(policyLower) && !policyLower.includes(eobLower)) {
          carrierMismatchWarning = `This EOB is from ${eobCarrier}, but the claim was analyzed against your ${policyCarrier} policy. The appeal letter will reference ${policyCarrier}. If this EOB is from a different carrier, please upload the correct EOB.`
          console.warn(`${tag} ⚠ CARRIER MISMATCH: EOB carrier="${eobCarrier}" vs policy carrier="${policyCarrier}"`)
        }
      }

      // Validate and normalize
      const status = parsed.status
      if (!['underpaid', 'correct', 'overpaid'].includes(status)) {
        throw new Error(`Invalid status: ${status}`)
      }

      if (status === 'underpaid') {
        // Compute corrected reimbursement — always runs, even without claim_id
        const actualPaid = Number(parsed.actual_paid_by_insurer) || 0
        const eobDeductible = Number(parsed.deductible_applied) || 0
        const eobRate = Number(parsed.reimbursement_rate_used) || null
        const eobEligible = Number(parsed.insurer_eligible_amount) || null
        console.log(`${tag} 🔍 EOB extracted: actualPaid=${actualPaid} deductible=${eobDeductible} rate=${eobRate} eligible=${eobEligible}`)

        const correctedEligible = coveredTotal  // PCIQ says this much should be covered
        const rateForCalc = eobRate || 80  // fallback to 80% if EOB didn't show rate
        const isCoinsuranceFirst = dbMathOrder === 'reimbursement_first' || dbMathOrder === 'reimbursement-first'
        let correctedReimbursement
        if (isCoinsuranceFirst) {
          // Healthy Paws: rate first, then deductible
          correctedReimbursement = Math.max(0, (correctedEligible * rateForCalc / 100) - eobDeductible)
        } else {
          // Standard: deductible first, then rate
          correctedReimbursement = Math.max(0, (correctedEligible - eobDeductible) * rateForCalc / 100)
        }
        const realShortfall = Math.max(0, correctedReimbursement - actualPaid)
        console.log(`${tag} 🔍 CORRECTED: eligible=${correctedEligible} rate=${rateForCalc}% deductible=${eobDeductible} mathOrder=${isCoinsuranceFirst ? 'coinsurance-first' : 'deductible-first'}`)
        console.log(`${tag} 🔍 CORRECTED: reimbursement=${correctedReimbursement.toFixed(2)} actualPaid=${actualPaid} realShortfall=${realShortfall.toFixed(2)}`)

        // Save comparison results to pciq_analyses so the Appeal tab can display them
        if (claim_id) {
          const { data: existing } = await supabase
            .from('pciq_analyses')
            .select('estimated_reimbursement, line_items')
            .eq('id', claim_id)
            .single()

          const updatedLineItems = {
            ...(existing?.line_items || {}),
            eob_disputed_items: parsed.disputed_items || [],
            eob_discrepancy: realShortfall,
            eob_actual_paid: actualPaid,
            eob_deductible_applied: eobDeductible,
            eob_reimbursement_rate_used: eobRate,
            eob_insurer_eligible_amount: eobEligible,
            eob_corrected_reimbursement: correctedReimbursement,
            appeals_email: parsed.appeals_email || null,
            appeals_address: parsed.appeals_address || null,
            appeals_phone: parsed.appeals_phone || null,
            appeals_deadline: parsed.appeals_deadline || null,
            appeals_reference: parsed.appeals_reference || null,
          }

          const { error: updateErr } = await supabase
            .from('pciq_analyses')
            .update({
              status: 'disputed',
              actual_payment: actualPaid,
              line_items: updatedLineItems,
            })
            .eq('id', claim_id)
          console.log(`${tag} Status update: claim_id=${claim_id} → 'disputed' actual_payment=${actualPaid} ${updateErr ? 'FAILED: ' + updateErr.message : 'OK'}`)
        }

        return res.json({
          status: 'underpaid',
          discrepancy: realShortfall,
          eob_actual_paid: actualPaid,
          eob_corrected_reimbursement: correctedReimbursement,
          disputed_items: parsed.disputed_items || [],
          appeals_email: parsed.appeals_email || null,
          appeals_address: parsed.appeals_address || null,
          appeals_phone: parsed.appeals_phone || null,
          appeals_deadline: parsed.appeals_deadline || null,
          appeals_reference: parsed.appeals_reference || null,
          eob_carrier: eobCarrier,
          carrier_mismatch_warning: carrierMismatchWarning,
        })
      }

      return res.json({ status, eob_carrier: eobCarrier, carrier_mismatch_warning: carrierMismatchWarning })

    } catch (error) {
      console.error(`${tag} Error:`, error)
      return res.status(500).json({ error: error.message || 'Failed to compare EOB.' })
    }
  })

  // ─── Generate Appeal Letter ──────────────────────────────────────────────────

  app.post('/api/pciq/generate-appeal', async (req, res) => {
    const tag = '[generate-appeal]'
    try {
      // Auth
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - token required' })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }

      const {
        claim_id,
        pet_name,
        carrier,
        clinic_name,
        covered_total,
        discrepancy,
        actual_paid,
        disputed_items = [],
        policy_number,
        appeals_reference,
      } = req.body

      let { visit_date, owner_name } = req.body

      const safeDiscrepancy = Math.abs(discrepancy || 0)

      console.log(`${tag} claim_id=${claim_id} discrepancy=$${safeDiscrepancy} items=${(disputed_items || []).length}`)

      // ── Fetch claim + policy + profile data from DB ──
      let dbServiceDate = null
      let dbLineItems = null
      let dbTotalBill = 0
      let dbPolicyId = null
      let policyRate = null       // e.g., 80
      let policyDeductible = null // e.g., 500
      let policyMathOrder = null  // "reimbursement_first" or "deductible_first"
      let dbPolicyNumber = null   // e.g., "I27298175"
      let ownerPhone = null

      if (claim_id) {
        const { data: claimRow } = await supabase
          .from('pciq_analyses')
          .select('service_date, line_items, total_bill, policy_id')
          .eq('id', claim_id)
          .single()
        dbServiceDate = claimRow?.service_date || null
        dbLineItems = claimRow?.line_items || null
        dbTotalBill = claimRow?.total_bill || 0
        dbPolicyId = claimRow?.policy_id || null
      }

      // Fetch policy details (reimbursement_rate, deductible, math_order, carrier)
      let dbCarrier = null
      if (dbPolicyId) {
        const { data: policyRow } = await supabase
          .from('pciq_policies')
          .select('reimbursement_rate, deductible, math_order, policy_number, carrier')
          .eq('id', dbPolicyId)
          .single()
        if (policyRow) {
          policyRate = policyRow.reimbursement_rate ?? null
          policyDeductible = policyRow.deductible ?? null
          policyMathOrder = policyRow.math_order ?? null
          dbPolicyNumber = policyRow.policy_number ?? null
          dbCarrier = policyRow.carrier ?? null
        }
      }
      // Always use the policy carrier from DB — the client might pass the EOB carrier by mistake
      if (dbCarrier && carrier && dbCarrier.toLowerCase() !== carrier.toLowerCase()) {
        console.warn(`${tag} ⚠ Carrier mismatch: req.body="${carrier}" vs policy DB="${dbCarrier}" — using DB carrier`)
      }
      const effectiveCarrier = dbCarrier || carrier || null
      console.log(`${tag} Policy: carrier=${effectiveCarrier} rate=${policyRate}% deductible=$${policyDeductible} mathOrder=${policyMathOrder}`)

      // ── Visit date: DB fallback + format to human-readable ──
      if (!visit_date && dbServiceDate) {
        visit_date = dbServiceDate
      }
      if (visit_date) {
        const d = new Date(visit_date + (typeof visit_date === 'string' && visit_date.length === 10 ? 'T12:00:00' : ''))
        if (!isNaN(d.getTime())) {
          visit_date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        }
      }
      console.log(`${tag} visit_date for prompt: "${visit_date || 'MISSING'}"`)

      // ── Owner name: user_metadata > profiles table > "[Your Name]" ──
      // Also fetch phone number from profiles
      console.log(`${tag} 👤 owner_name from req.body: ${JSON.stringify(req.body.owner_name)}`)
      console.log(`${tag} 👤 Querying profiles table with user.id: ${user.id}`)
      if (!owner_name) {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single()
        console.log(`${tag} 👤 profiles result: ${JSON.stringify(profile)} error: ${profileErr ? profileErr.message : 'none'}`)
        if (profile?.full_name) {
          owner_name = profile.full_name
        } else {
          owner_name = '[Your Name]'
        }
        ownerPhone = profile?.phone || null
      } else {
        // Still fetch phone even if name came from request
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .single()
        ownerPhone = profile?.phone || null
      }
      console.log(`${tag} 👤 FINAL owner_name="${owner_name}" phone="${ownerPhone || 'NONE'}"`)

      if (!safeDiscrepancy || safeDiscrepancy <= 0) {
        return res.status(400).json({ error: 'No discrepancy to appeal.' })
      }

      // ── Compute amounts for the letter ──
      const coveredAmt = covered_total || Number(dbLineItems?.covered_total ?? 0)
      // total_bill: prefer sum of line item amounts (most accurate) over DB column
      const lineItemsArr = dbLineItems?.items || []
      const lineItemsTotal = lineItemsArr.reduce((sum, i) => sum + (i.amount || 0), 0)
      const totalBill = lineItemsTotal > 0 ? lineItemsTotal : (dbTotalBill || 0)
      const excludedAmt = Math.max(0, totalBill - coveredAmt)
      console.log(`${tag} 💰 totalBill: DB=${dbTotalBill} lineItemsSum=${lineItemsTotal.toFixed(2)} using=${totalBill.toFixed(2)} covered=${coveredAmt.toFixed(2)} excluded=${excludedAmt.toFixed(2)}`)
      const rate = policyRate ?? 80     // fallback 80%
      // Prefer EOB's stated deductible (what the insurer actually applied) over policy default
      const eobDeductibleApplied = Number(dbLineItems?.eob_deductible_applied) || 0
      const deductible = eobDeductibleApplied > 0 ? eobDeductibleApplied : (policyDeductible ?? 0)
      console.log(`${tag} 💰 deductible: eob=${eobDeductibleApplied} policy=${policyDeductible} using=${deductible}`)
      const isCoinsuranceFirst =
        policyMathOrder === 'reimbursement_first' ||
        policyMathOrder === 'reimbursement-first' ||
        (effectiveCarrier ?? '').toLowerCase().includes('healthy paws')

      // Math steps depend on carrier — compute reimbursement server-side
      console.log(`${tag} 🔍 APPEAL: req.body.actual_paid = ${JSON.stringify(actual_paid)} (type: ${typeof actual_paid})`)
      const eobPaid = Math.max(0, Number(actual_paid) || 0)
      console.log(`${tag} 🔍 APPEAL: eobPaid after computation = ${eobPaid}`)
      let mathStep1Label, mathStep2Label, mathStep3Label
      let computedReimbursement
      if (isCoinsuranceFirst) {
        // Healthy Paws: rate first, then deductible
        const atRate = coveredAmt * (rate / 100)
        computedReimbursement = Math.max(0, atRate - deductible)
        mathStep1Label = `$${coveredAmt.toFixed(2)} × ${rate}% = $${atRate.toFixed(2)}`
        mathStep2Label = `$${atRate.toFixed(2)} − $${deductible.toFixed(2)} deductible = $${computedReimbursement.toFixed(2)}`
      } else {
        // Standard: deductible first, then rate
        const afterDeductible = Math.max(0, coveredAmt - deductible)
        computedReimbursement = afterDeductible * (rate / 100)
        mathStep1Label = `$${coveredAmt.toFixed(2)} − $${deductible.toFixed(2)} deductible = $${afterDeductible.toFixed(2)}`
        mathStep2Label = `$${afterDeductible.toFixed(2)} × ${rate}% = $${computedReimbursement.toFixed(2)}`
      }
      // If EOB paid something, add a step showing the shortfall
      const amountOwed = eobPaid > 0 ? Math.max(0, computedReimbursement - eobPaid) : computedReimbursement
      if (eobPaid > 0) {
        mathStep3Label = `$${computedReimbursement.toFixed(2)} − $${eobPaid.toFixed(2)} already paid = $${amountOwed.toFixed(2)}`
      }

      // Build excluded items list (names + amounts)
      const excludedItemsList = (dbLineItems?.items || [])
        .filter(i => !i.covered)
        .map(i => `${i.description || 'Item'} ($${(i.amount || 0).toFixed(2)})`)

      // Build covered items list (names only — for reference)
      const coveredItemsList = (dbLineItems?.items || [])
        .filter(i => i.covered)
        .map(i => i.description || 'Item')

      // Build disputed items summary for the appeal letter
      const eobDisputedItems = disputed_items.length > 0
        ? disputed_items
        : (dbLineItems?.eob_disputed_items || [])
      const disputedItemsSummary = eobDisputedItems.map((item, idx) => {
        const name = item.name || 'Item'
        const amt = Number(item.pciq_predicted || item.amount || 0).toFixed(2)
        const denial = item.denial_reason || item.reason || 'not specified'
        const citation = item.policy_citation || item.policy_section || ''
        const coverageReason = item.coverage_reason || ''
        return `${idx + 1}. ${name} ($${amt}) — The EOB states this was denied as "${denial}." However, ${citation ? `this is covered under the policy: "${citation}."` : `this is a covered service under the policy (${coverageReason}).`}`
      }).join('\n')
      console.log(`${tag} Disputed items for letter: ${eobDisputedItems.length} items`)

      const policyNum = policy_number || dbPolicyNumber || null
      const claimRef = appeals_reference || claim_id || null

      console.log(`${tag} Letter data: totalBill=$${totalBill} covered=$${coveredAmt} excluded=$${excludedAmt} rate=${rate}% deductible=$${deductible} reimbursement=$${computedReimbursement.toFixed(2)} eobPaid=$${eobPaid.toFixed(2)} amountOwed=$${amountOwed.toFixed(2)} mathOrder=${isCoinsuranceFirst ? 'coinsurance-first' : 'deductible-first'}`)
      console.log(`${tag} Excluded items: ${excludedItemsList.join(', ') || 'NONE'}`)
      console.log(`${tag} Covered items: ${coveredItemsList.join(', ') || 'NONE'}`)

      const prompt = `You are a concise, assertive insurance appeal writer. Write a single confident letter — no repetition, no boilerplate per item, no filler. Tone: a pit bull lawyer who knows the math cold.

Output the letter as PLAIN TEXT. No markdown, no bold markers, no asterisks, no headers. Just a clean letter.

HEADER BLOCK (each on its own line at the top of the letter, before the greeting):
${policyNum ? `Policy Number: ${policyNum}` : '(omit — not available)'}
${claimRef ? `Claim Reference: ${claimRef}` : '(omit — not available)'}
Pet: ${pet_name || '[Pet Name]'}
Date of Service: ${visit_date || '[Date]'}
Provider: ${clinic_name || '[Clinic]'}

Then "Dear ${effectiveCarrier || 'Claims'} Claims Department,"

PARAGRAPH 1 — THE DISCREPANCY (2-3 sentences max):
State that you are writing regarding ${pet_name || 'the pet'}'s visit on ${visit_date || '[date]'} at ${clinic_name || '[clinic]'}. The total bill was $${totalBill.toFixed(2)}. ${excludedItemsList.length > 0
  ? `You acknowledge that ${excludedItemsList.join(', ')} (totaling $${excludedAmt.toFixed(2)}) ${excludedItemsList.length === 1 ? 'is' : 'are'} properly excluded, leaving $${coveredAmt.toFixed(2)} in covered charges.`
  : `All $${coveredAmt.toFixed(2)} in charges are covered under the policy.`}
Your records indicate ${effectiveCarrier || 'the insurer'} paid $${eobPaid.toFixed(2)} on this claim. The correct reimbursement is $${computedReimbursement.toFixed(2)}${eobPaid > 0 ? `, leaving $${amountOwed.toFixed(2)} still owed` : ''}.

${eobDisputedItems.length > 0 ? `PARAGRAPH 2 — DISPUTED ITEMS (list each wrongly denied item):
The following items were wrongly denied or underpaid:
${disputedItemsSummary}

For each item: state the amount, quote the insurer's denial reason from the EOB, then counter with the policy language showing why it IS covered. Use the exact policy citations provided above. Keep each item to 2-3 sentences max.
` : ''}PARAGRAPH ${eobDisputedItems.length > 0 ? '3' : '2'} — THE MATH (show exact steps, no prose — just the calculation):
Under ${pet_name || 'the pet'}'s policy:
Step 1: ${mathStep1Label}
Step 2: ${mathStep2Label}${mathStep3Label ? `\nStep 3: ${mathStep3Label}` : ''}
Amount owed: $${amountOwed.toFixed(2)}

PARAGRAPH ${eobDisputedItems.length > 0 ? '4' : '3'} — THE DEMAND (1 sentence only):
State that you are requesting immediate remittance of exactly $${amountOwed.toFixed(2)}. Nothing else — go straight to the sign-off after this sentence.

SIGN OFF:
Sincerely,
${owner_name}${ownerPhone ? `\n${ownerPhone}` : ''}

RULES:
- For disputed items: USE the exact policy citations and denial reasons provided — do NOT invent or paraphrase them
- For disputed items: keep each to 2-3 sentences — name, EOB denial quote, policy counter-citation
- Do NOT repeat coverage category labels like "Covered — diagnostic"
- Do NOT mention deductible disputes — only coverage disputes
- Do NOT use markdown formatting (no **, no ##, no bullets)
- Do NOT add a subject line or "RE:" — start with the header block
- The ONLY dollar amount to demand is $${amountOwed.toFixed(2)}
- Keep the entire letter under ${eobDisputedItems.length > 0 ? '400' : '250'} words
- Write it as if you have sent hundreds of these and know exactly what gets results`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })

      const letter = completion.choices[0]?.message?.content?.trim()
      if (!letter) {
        throw new Error('Empty response from OpenAI')
      }

      console.log(`${tag} Generated letter (${letter.length} chars)`)

      // Fetch appeals contact info from line_items (extracted by compare-eob)
      let appealsContact = { appeals_email: null, appeals_phone: null, appeals_address: null }
      if (claim_id) {
        // Safety net: ensure pciq_analyses status is 'disputed'
        const { data: row, error: updateErr } = await supabase
          .from('pciq_analyses')
          .update({ status: 'disputed' })
          .eq('id', claim_id)
          .select('line_items')
          .single()
        console.log(`${tag} Status update: claim_id=${claim_id} → 'disputed' ${updateErr ? 'FAILED: ' + updateErr.message : 'OK'}`)

        if (row?.line_items) {
          const li = row.line_items
          appealsContact = {
            appeals_email: li.appeals_email || null,
            appeals_phone: li.appeals_phone || null,
            appeals_address: li.appeals_address || null,
          }
          console.log(`${tag} Appeals contact: email=${appealsContact.appeals_email} phone=${appealsContact.appeals_phone} address=${appealsContact.appeals_address ? 'present' : 'null'}`)
        }
      }

      return res.json({ letter, ...appealsContact })

    } catch (error) {
      console.error(`${tag} Error:`, error)
      return res.status(500).json({ error: error.message || 'Failed to generate appeal letter.' })
    }
  })

  // ─── Email-In: AI Classification & Completeness ────────────────────────────

  // Classify a single document via GPT-4o (PDF text or image)
  const classifyDocument = async (docRecord) => {
    const tag = '[email-in/classify]'
    try {
      const { id, file_url, filename, mime_type, user_id } = docRecord
      const isPdf = (mime_type || '').includes('pdf') || (filename || '').toLowerCase().endsWith('.pdf')

      // Download file from Supabase Storage
      const storagePath = file_url.includes('/object/public/')
        ? file_url.split('/object/public/policy-documents/')[1]
        : file_url
      const { data: blob, error: dlErr } = await supabase.storage
        .from('policy-documents')
        .download(storagePath)

      if (dlErr || !blob) {
        console.error(`${tag} Download failed for ${filename}:`, dlErr?.message)
        return null
      }
      const fileBuffer = Buffer.from(await blob.arrayBuffer())

      // Build content for GPT-4o
      let fileContents = []
      let pdfText = ''
      if (isPdf) {
        // Extract first 5 pages for classification (declarations info often on pages 4-5)
        try {
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise
          const maxPages = Math.min(pdf.numPages, 5)
          const pieces = []
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i)
            const content = await page.getTextContent()
            pieces.push((content.items || []).map(it => it.str || '').join(' '))
          }
          pdfText = pieces.join('\n\n')
          console.log(`${tag} Extracted ${maxPages}/${pdf.numPages} pages from ${filename} (${pdfText.length} chars)`)
        } catch (pdfErr) {
          console.error(`${tag} PDF extraction failed for ${filename}:`, pdfErr.message)
          return null
        }
      } else {
        // Image — send as image_url
        const mimeGuess = /\.(jpe?g)$/i.test(filename) ? 'image/jpeg' : 'image/png'
        const dataUrl = `data:${mimeGuess};base64,${fileBuffer.toString('base64')}`
        fileContents.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } })
      }

      const classificationPrompt = `You are analyzing a document that was emailed to a pet insurance analysis service. Classify this document into ONE of these categories:

- DECLARATIONS: A pet insurance declarations page or schedule of benefits. Contains specific policyholder details: pet name, deductible amount, reimbursement percentage, annual limit, effective dates, policy number. Usually 1-3 pages.
- POLICY_TERMS: A pet insurance policy booklet or terms document. Contains coverage rules, exclusions, waiting periods, definitions, what is and isn't covered. Usually 10-30+ pages. Does NOT contain the specific dollar amounts for this policyholder's deductible/reimbursement. IMPORTANT: Endorsements, riders, amendments, and supplementary coverage documents (e.g., "Preventive Care Endorsement", "Wellness Rider", "Policy Amendment") are POLICY_TERMS — they modify coverage terms and are needed for accurate analysis. Do NOT classify endorsements as IRRELEVANT.
- COMBINED: A single document that contains BOTH the declarations/schedule AND the full policy terms/exclusions. Some carriers (like Pumpkin) send everything in one PDF.
- EOB: An Explanation of Benefits from an insurance company showing claim payment details. Contains claim numbers, amounts paid, denied items, applied to deductible.
- VET_BILL: A veterinary invoice or receipt showing services performed and charges.
- IRRELEVANT: Not a pet insurance document. Could be car insurance, a marketing brochure, a receipt for something unrelated, or any other non-pet-insurance document. Do NOT classify pet insurance endorsements, riders, or amendments as IRRELEVANT — those are POLICY_TERMS.

DOCUMENT TEXT:
${pdfText || '(No text extracted — see attached image)'}

Also extract these fields if you can find them (return null for any you cannot find):
- carrier_name: The insurance company name (use consumer-facing brand name, not underwriting entity). Brand mappings: "Westchester Fire Insurance Company" = "Healthy Paws", "United States Fire Insurance Company" = "Pumpkin", "American Pet Insurance Company" = "Fetch", "Independence American Insurance Company" = "Figo", "National Casualty Company" = "Nationwide Pet Insurance", "Cimarron Insurance Company" = "Kanguro", "Kanguro Insurance LLC" = "Kanguro". IMPORTANT: Look for the consumer-facing brand name in logos, headers, footers, and watermarks — not just the underwriting entity. If you see a brand logo or "administered by [Brand]", use the brand name. Always return a carrier_name if ANY insurance company name appears in the document — never return null if you can identify one.
- pet_name, policy_number, species (dog or cat), breed
- deductible: Annual deductible amount (number only)
- reimbursement_rate: Percentage the INSURER pays (number only, e.g. 80 not 0.80). CRITICAL: If carrier is Nationwide, "co-insurance" means the OWNER's share — subtract from 100. If carrier is Figo (newer form "IAIC FPI POL"), use the "Reimbursement Percentage" not the "Coinsurance".
- annual_limit: Annual coverage limit (number only, or null if unlimited)
- effective_date, expiration_date: YYYY-MM-DD format
- math_order: "reimbursement_first" if percentage applied before deductible, "deductible_first" if deductible subtracted before percentage, null if unknown

Respond in JSON only, no markdown, no backticks:
{"classification":"DECLARATIONS|POLICY_TERMS|COMBINED|EOB|VET_BILL|IRRELEVANT","confidence":"high|medium|low","carrier_name":null,"pet_name":null,"policy_number":null,"deductible":null,"reimbursement_rate":null,"annual_limit":null,"effective_date":null,"expiration_date":null,"species":null,"breed":null,"math_order":null,"notes":"Brief description of what this document contains"}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a pet insurance document classifier. Return valid JSON only.' },
          { role: 'user', content: [{ type: 'text', text: classificationPrompt }, ...fileContents] }
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      })

      const raw = completion.choices?.[0]?.message?.content ?? ''
      let result = null
      try {
        let c = raw.trim()
        if (c.startsWith('```')) c = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
        result = JSON.parse(c)
      } catch {
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) { try { result = JSON.parse(m[0]) } catch {} }
      }

      if (!result) {
        console.error(`${tag} Failed to parse classification for ${filename}:`, raw.substring(0, 200))
        return null
      }

      // Co-insurance safety net (same as extract-policy endpoint)
      if (result.reimbursement_rate != null && result.reimbursement_rate <= 30) {
        const carrierLower = (result.carrier_name || '').toLowerCase()
        if (carrierLower.includes('nationwide') || carrierLower.includes('figo')) {
          const original = result.reimbursement_rate
          result.reimbursement_rate = 100 - original
          console.log(`${tag} ⚠ Co-insurance safety net: ${result.carrier_name} ${original}% → ${result.reimbursement_rate}%`)
        }
      }

      // ── Fallback: if COMBINED or DECLARATIONS but missing deductible, re-extract pages 4-8 ──
      const cls = (result.classification || '').toUpperCase()
      if ((cls === 'COMBINED' || cls === 'DECLARATIONS') && result.deductible == null && isPdf) {
        console.log(`${tag} Deductible missing on ${cls} doc — re-extracting pages 4-8 for ${filename}`)
        try {
          const pdf2 = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise
          const startPage = 4
          const endPage = Math.min(pdf2.numPages, 8)
          if (startPage <= pdf2.numPages) {
            const laterPieces = []
            for (let i = startPage; i <= endPage; i++) {
              const page = await pdf2.getPage(i)
              const content = await page.getTextContent()
              laterPieces.push((content.items || []).map(it => it.str || '').join(' '))
            }
            const laterText = laterPieces.join('\n\n')
            console.log(`${tag} Fallback: extracted pages ${startPage}-${endPage} (${laterText.length} chars)`)

            const fallbackPrompt = `Extract ONLY the policy numbers from this pet insurance document text. Look for declarations page, schedule of benefits, or coverage summary.

DOCUMENT TEXT (pages ${startPage}-${endPage}):
${laterText}

Extract these fields (return null for any not found):
- deductible: Annual deductible dollar amount (number only)
- reimbursement_rate: Percentage the insurer pays (number only, e.g. 80 not 0.80). If carrier is Nationwide, "co-insurance" = owner's share, subtract from 100.
- annual_limit: Annual coverage limit (number only, null if unlimited)
- policy_number: Policy or certificate number (string)
- effective_date: YYYY-MM-DD format
- expiration_date: YYYY-MM-DD format
- pet_name: Insured pet's name
- species: dog or cat
- breed: Pet breed

Return JSON only, no markdown:
{"deductible":null,"reimbursement_rate":null,"annual_limit":null,"policy_number":null,"effective_date":null,"expiration_date":null,"pet_name":null,"species":null,"breed":null}`

            const fallbackCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: 'Extract policy numbers from the document. Return valid JSON only.' },
                { role: 'user', content: fallbackPrompt }
              ],
              temperature: 0.1,
              max_tokens: 400,
              response_format: { type: 'json_object' }
            })

            const fbRaw = fallbackCompletion.choices?.[0]?.message?.content ?? ''
            let fbResult = null
            try { fbResult = JSON.parse(fbRaw.trim()) } catch { const m = fbRaw.match(/\{[\s\S]*\}/); if (m) try { fbResult = JSON.parse(m[0]) } catch {} }

            if (fbResult) {
              let merged = 0
              for (const key of ['deductible', 'reimbursement_rate', 'annual_limit', 'policy_number', 'effective_date', 'expiration_date', 'pet_name', 'species', 'breed']) {
                if (fbResult[key] != null && result[key] == null) {
                  result[key] = fbResult[key]
                  merged++
                }
              }
              console.log(`${tag} Fallback merged ${merged} field(s): ded=${result.deductible} rate=${result.reimbursement_rate} limit=${result.annual_limit}`)

              // Re-apply coinsurance safety net on any newly extracted rate
              if (result.reimbursement_rate != null && result.reimbursement_rate <= 30) {
                const carrierLower = (result.carrier_name || '').toLowerCase()
                if (carrierLower.includes('nationwide') || carrierLower.includes('figo')) {
                  const original = result.reimbursement_rate
                  result.reimbursement_rate = 100 - original
                  console.log(`${tag} ⚠ Fallback co-insurance safety net: ${original}% → ${result.reimbursement_rate}%`)
                }
              }
            }
          }
        } catch (fbErr) {
          console.error(`${tag} Fallback extraction failed:`, fbErr.message)
        }
      }

      console.log(`${tag} Classified ${filename}: ${result.classification} (${result.confidence}) carrier=${result.carrier_name || '—'} pet=${result.pet_name || '—'} ded=${result.deductible ?? '—'} rate=${result.reimbursement_rate ?? '—'} limit=${result.annual_limit ?? '—'}`)
      return result

    } catch (err) {
      console.error(`${tag} Classification error for ${docRecord.filename}:`, err.message)
      return null
    }
  }

  // Check if a user has enough documents to build a complete policy
  // currentBatchIds: optional array of doc IDs from the most recent email — their carrier takes priority
  const checkPolicyCompleteness = async (userId, currentBatchIds = []) => {
    const tag = '[email-in/completeness]'

    const { data: docs, error } = await supabase
      .from('pciq_email_documents')
      .select('id, document_type, extracted_data, classification_status')
      .eq('user_id', userId)
      .eq('classification_status', 'classified')
      .order('created_at', { ascending: false })

    if (error || !docs || docs.length === 0) {
      return { status: 'no_policy_docs', has_declarations: false, has_policy_terms: false, has_combined: false, carrier_name: null, missing: [], extracted_fields: {} }
    }

    let has_declarations = false
    let has_policy_terms = false
    let has_combined = false
    let carrier_name = null
    let batchCarrier = null // carrier from the current email batch (highest priority)
    // Merge extracted fields from all docs — later docs override earlier for same fields
    const merged = {}
    const batchIdSet = new Set(currentBatchIds.map(id => String(id)))

    for (const doc of docs) {
      const dtype = (doc.document_type || '').toUpperCase()
      const data = doc.extracted_data || {}

      if (dtype === 'DECLARATIONS') has_declarations = true
      if (dtype === 'POLICY_TERMS') has_policy_terms = true
      if (dtype === 'COMBINED') has_combined = true

      // Merge fields — prefer non-null values
      for (const key of ['carrier_name', 'pet_name', 'policy_number', 'deductible', 'reimbursement_rate', 'annual_limit', 'effective_date', 'expiration_date', 'species', 'breed', 'math_order']) {
        if (data[key] != null && merged[key] == null) {
          merged[key] = data[key]
        }
      }
      // Track carrier from current batch separately — it takes priority
      if (data.carrier_name && batchIdSet.has(String(doc.id)) && !batchCarrier) {
        batchCarrier = data.carrier_name
      }
      if (data.carrier_name && !carrier_name) carrier_name = data.carrier_name
    }
    // Current batch carrier always wins over older docs
    if (batchCarrier) {
      carrier_name = batchCarrier
      merged.carrier_name = batchCarrier
    }

    let status = 'no_policy_docs'
    const missing = []

    if (has_combined) {
      status = 'complete'
    } else if (has_declarations && has_policy_terms) {
      status = 'complete'
    } else if (has_declarations) {
      status = 'partial'
      missing.push('policy_terms')
    } else if (has_policy_terms) {
      status = 'partial'
      missing.push('declarations')
    }

    // If we have declarations or combined, check we got the key numeric fields
    if (status === 'complete' || has_declarations || has_combined) {
      if (!merged.deductible && !merged.reimbursement_rate) {
        // Declarations without key fields — might be a mis-classification
        console.log(`${tag} Warning: marked complete but missing deductible and rate — may need review`)
      }
    }

    console.log(`${tag} User ${userId}: status=${status} combined=${has_combined} decl=${has_declarations} terms=${has_policy_terms} carrier=${carrier_name || '—'} missing=${JSON.stringify(missing)}`)
    return { status, has_declarations, has_policy_terms, has_combined, carrier_name, missing, extracted_fields: merged }
  }

  // Auto-save a policy to pciq_policies from classified email documents
  const autoSavePolicy = async (userId, completeness) => {
    const tag = '[email-in/auto-save]'
    const f = completeness.extracted_fields

    if (!f.carrier_name || (!f.deductible && !f.reimbursement_rate)) {
      console.log(`${tag} Skipping auto-save — insufficient extracted fields (carrier=${f.carrier_name}, ded=${f.deductible}, rate=${f.reimbursement_rate})`)
      return false
    }

    // Check for duplicate — match on carrier AND pet name (user may have multiple carriers)
    let existsQuery = supabase
      .from('pciq_policies')
      .select('id')
      .eq('user_id', userId)
      .ilike('carrier', `%${f.carrier_name}%`)
    if (f.pet_name) {
      existsQuery = existsQuery.ilike('pet_name', `%${f.pet_name}%`)
    }
    const { data: existing } = await existsQuery.limit(1)

    if (existing && existing.length > 0) {
      console.log(`${tag} Policy already exists for ${f.carrier_name} + ${f.pet_name || 'unknown pet'} — skipping auto-save`)
      return 'exists'
    }

    const policyRow = {
      user_id: userId,
      carrier: f.carrier_name,
      pet_name: f.pet_name || null,
      species: f.species ? f.species.charAt(0).toUpperCase() + f.species.slice(1).toLowerCase() : null,
      breed: f.breed || null,
      deductible: f.deductible || null,
      reimbursement_rate: f.reimbursement_rate || null,
      annual_limit: f.annual_limit || null,
      effective_date: f.effective_date || null,
      expiration_date: f.expiration_date || null,
      math_order: f.math_order || null,
      policy_number: f.policy_number || null,
      policy_text: `Auto-extracted from emailed policy documents for ${f.carrier_name}.`,
      exclusions: null,
      filing_deadline_days: null,
      storage_path: null,
    }

    const { error: insertErr } = await supabase
      .from('pciq_policies')
      .insert(policyRow)

    if (insertErr) {
      console.error(`${tag} Failed to save policy:`, insertErr.message)
      return false
    }

    console.log(`${tag} ✅ Auto-saved policy: ${f.carrier_name} for ${f.pet_name || 'unknown pet'}, ${f.reimbursement_rate || '?'}% / $${f.deductible || '?'} deductible`)
    return true
  }

  // Send confirmation email after processing emailed documents
  const sendDocConfirmationEmail = async ({ toEmail, token, completeness, policySaved }) => {
    const tag = '[email-in/confirm]'
    const from = process.env.MAIL_FROM || 'Pet ClaimIQ <noreply@petclaimhelper.com>'
    const f = completeness.extracted_fields
    const carrier = completeness.carrier_name || 'your insurance'
    const pet = f.pet_name || 'your pet'
    const inboxAddr = `${token}@docs.petclaimhelper.com`

    const footer = `<p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">Send more documents to: <a href="mailto:${inboxAddr}" style="color:#4ade80;">${inboxAddr}</a></p>`
    const wrapper = (body) => `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#1f2937;line-height:1.6;font-size:14px;">${body}${footer}<p style="font-size:12px;color:#9ca3af;margin-top:12px;">— Pet ClaimIQ</p></div>`

    let subject = ''
    let html = ''

    if (completeness.status === 'complete' && policySaved === 'exists') {
      // ── Scenario 4: Complete — policy already exists ──
      subject = `${pet}'s ${carrier} policy is up to date`
      html = wrapper(`<p>We received your <strong>${carrier}</strong> documents. <strong>${pet}</strong>'s policy is already in Pet ClaimIQ and up to date — you're ready to analyze vet bills.</p>`)

    } else if (completeness.status === 'complete' && policySaved) {
      // ── Scenario 1: Complete — policy saved ──
      subject = `${pet}'s ${carrier} policy is ready`
      html = wrapper(`<p>We received your <strong>${carrier}</strong> documents and set up <strong>${pet}</strong>'s policy in Pet ClaimIQ. You're ready to analyze vet bills.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Carrier</td><td style="padding:6px 0;font-weight:600;">${carrier}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Pet</td><td style="padding:6px 0;font-weight:600;">${pet}</td></tr>
          ${f.deductible != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Deductible</td><td style="padding:6px 0;font-weight:600;">$${Number(f.deductible).toLocaleString()}</td></tr>` : ''}
          ${f.reimbursement_rate != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Reimbursement</td><td style="padding:6px 0;font-weight:600;">${f.reimbursement_rate}%</td></tr>` : ''}
          ${f.annual_limit != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Annual Limit</td><td style="padding:6px 0;font-weight:600;">$${Number(f.annual_limit).toLocaleString()}</td></tr>` : ''}
          ${f.effective_date ? `<tr><td style="padding:6px 0;color:#6b7280;">Effective</td><td style="padding:6px 0;font-weight:600;">${f.effective_date}${f.expiration_date ? ' to ' + f.expiration_date : ''}</td></tr>` : ''}
        </table>`)

    } else if (completeness.status === 'partial') {
      // ── Scenario 2: Partial — missing documents ──
      subject = `We need one more document for ${pet}'s policy`
      let guidance = ''
      if (completeness.missing.includes('declarations')) {
        guidance = `<p>We found your <strong>${carrier}</strong> policy terms but we're missing your declarations page — that's the document with your specific coverage numbers (deductible, reimbursement rate, annual limit). It's usually 1-2 pages with your pet's name on it.</p>
        <p>Check your email from ${carrier} or log into your ${carrier} account to download it. Just reply to this email with the document attached.</p>`
      } else if (completeness.missing.includes('policy_terms')) {
        guidance = `<p>We found your <strong>${carrier}</strong> declarations page${f.reimbursement_rate ? ` showing ${pet} at ${f.reimbursement_rate}%` : ''}${f.deductible ? ` with a $${Number(f.deductible).toLocaleString()} deductible` : ''}. But we need the full policy terms to know what's covered and excluded.</p>
        <p>Look for a longer PDF (10-30 pages) from ${carrier} with sections about exclusions, waiting periods, and covered conditions. Reply to this email with it attached.</p>`
      }
      html = wrapper(`<p>We received your documents — almost there!</p>${guidance}`)

    } else {
      // ── Scenario 3: No policy docs found ──
      subject = "We couldn't find a pet insurance policy in your documents"
      html = wrapper(`<p>We received your email but the attached documents don't appear to be pet insurance policy documents.</p>
        <p>To set up your policy, we need your insurance documents — look for an email from your pet insurance company with your policy attached, or log into your insurer's website to download them.</p>
        <p>Then forward that email (or attach the documents) and send them to <a href="mailto:${inboxAddr}" style="color:#4ade80;">${inboxAddr}</a>.</p>`)
    }

    try {
      const { error: sendErr } = await resend.emails.send({
        from,
        to: [toEmail],
        subject,
        html,
      })
      if (sendErr) {
        console.error(`${tag} Resend error:`, sendErr)
      } else {
        console.log(`${tag} ✅ Sent confirmation to ${toEmail}: "${subject}"`)
      }
    } catch (err) {
      console.error(`${tag} Failed to send confirmation:`, err.message)
    }
  }

  // ─── Email-In Webhook (Resend Inbound) ─────────────────────────────────────
  // Rate limiter for Resend email webhook
  const emailWebhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per IP per minute
    message: { ok: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
  })

  // Receives inbound emails at *@docs.petclaimhelper.com, downloads attachments
  // via the Resend API, and stores them in Supabase Storage + pciq_email_documents.
  app.post('/api/webhook/email-in', emailWebhookLimiter, async (req, res) => {
    const tag = '[email-in]'

    // ── Resend webhook signature verification (Svix HMAC-SHA256) ──
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (webhookSecret) {
      const svixId = req.headers['svix-id']
      const svixTimestamp = req.headers['svix-timestamp']
      const svixSignature = req.headers['svix-signature']

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.log(`${tag} Webhook signature verification failed: missing svix headers`)
        return res.status(401).json({ error: 'Webhook signature verification failed' })
      }

      // Reject timestamps older than 5 minutes to prevent replay attacks
      const nowSeconds = Math.floor(Date.now() / 1000)
      const ts = parseInt(svixTimestamp, 10)
      if (isNaN(ts) || Math.abs(nowSeconds - ts) > 300) {
        console.log(`${tag} Webhook signature verification failed: timestamp too old or invalid`)
        return res.status(401).json({ error: 'Webhook signature verification failed' })
      }

      // Strip "whsec_" prefix and base64-decode the secret
      const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64')

      // Sign: "{svix-id}.{svix-timestamp}.{rawBody}"
      const rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString('utf8') : String(req.rawBody || '')
      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
      const expectedSig = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64')

      // svix-signature may contain multiple "v1,<sig>" entries separated by spaces
      const signatures = svixSignature.split(' ')
      const verified = signatures.some(s => {
        const [version, sig] = s.split(',')
        return version === 'v1' && sig === expectedSig
      })

      if (!verified) {
        console.log(`${tag} Webhook signature verification failed: signature mismatch`)
        return res.status(401).json({ error: 'Webhook signature verification failed' })
      }
    } else {
      console.log(`${tag} WARNING: RESEND_WEBHOOK_SECRET not set — skipping signature verification`)
    }

    try {
      const payload = req.body
      if (!payload || payload.type !== 'email.received') {
        console.log(`${tag} Ignored non-email event: ${payload?.type || 'empty'}`)
        return res.status(200).json({ ok: true })
      }

      const { email_id, from: fromAddr, to: toAddrs, subject, attachments } = payload.data || {}
      console.log(`${tag} Received email ${email_id} from="${fromAddr}" to=${JSON.stringify(toAddrs)} subject="${subject}" attachments=${attachments?.length || 0}`)

      // ── Extract token from recipient address ──
      // Format: {token}@docs.petclaimhelper.com
      const recipientEmail = (toAddrs || []).find(addr => addr.includes('@docs.petclaimhelper.com'))
      if (!recipientEmail) {
        console.log(`${tag} No @docs.petclaimhelper.com recipient found, ignoring`)
        return res.status(200).json({ ok: true })
      }
      const token = recipientEmail.split('@')[0].toLowerCase()
      console.log(`${tag} Token: ${token}`)

      // ── Look up user by email_token ──
      const { data: userData, error: userErr } = await supabase
        .from('pciq_users')
        .select('id, email')
        .eq('email_token', token)
        .single()

      if (userErr || !userData) {
        console.log(`${tag} No user found for token "${token}", ignoring`)
        return res.status(200).json({ ok: true })
      }
      const userId = userData.id
      console.log(`${tag} Matched user: ${userData.email} (${userId})`)

      // ── Filter attachments: only docs over 50KB ──
      const validExts = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.tiff']
      const validMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/tiff']
      const docAttachments = (attachments || []).filter(att => {
        const fname = (att.filename || '').toLowerCase()
        const mime = (att.content_type || '').toLowerCase()
        const ext = fname.substring(fname.lastIndexOf('.'))
        // Skip tiny inline images (signatures etc), calendar files, text files
        if (fname.endsWith('.ics') || fname.endsWith('.txt') || fname.endsWith('.html')) return false
        return validExts.includes(ext) || validMimes.some(m => mime.startsWith(m.split('/')[0]))
      })

      if (docAttachments.length === 0) {
        console.log(`${tag} No valid document attachments found, ignoring`)
        return res.status(200).json({ ok: true, message: 'No document attachments' })
      }
      console.log(`${tag} Processing ${docAttachments.length} document attachment(s)`)

      // ── Download each attachment via Resend API and store ──
      const stored = []
      for (const att of docAttachments) {
        try {
          // Fetch attachment content via Resend API
          const attRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}/attachments`, {
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
          })
          if (!attRes.ok) {
            console.error(`${tag} Failed to list attachments: ${attRes.status}`)
            continue
          }
          const attList = await attRes.json()
          const attMeta = (attList.data || []).find(a => a.id === att.id)
          if (!attMeta || !attMeta.download_url) {
            console.error(`${tag} No download_url for attachment ${att.id} (${att.filename})`)
            continue
          }

          // Download the actual file
          const fileRes = await fetch(attMeta.download_url)
          if (!fileRes.ok) {
            console.error(`${tag} Failed to download attachment: ${fileRes.status}`)
            continue
          }
          const fileBuffer = Buffer.from(await fileRes.arrayBuffer())
          const fileSizeBytes = fileBuffer.length

          // Skip files under 50KB (likely signatures/inline images)
          if (fileSizeBytes < 50 * 1024) {
            console.log(`${tag} Skipping ${att.filename} — too small (${fileSizeBytes} bytes)`)
            continue
          }

          // Validate file format (magic bytes) and size
          const validation = validateFileBuffer(fileBuffer, att.filename)
          if (!validation.valid) {
            console.log(`${tag} Rejected ${att.filename} — ${validation.reason}: ${validation.message}`)
            continue
          }

          // Upload to Supabase Storage
          const timestamp = Date.now()
          const safeFilename = (att.filename || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_')
          const storagePath = `${userId}/${timestamp}_${safeFilename}`

          const { error: uploadErr } = await supabase.storage
            .from('policy-documents')
            .upload(storagePath, fileBuffer, {
              contentType: att.content_type || 'application/octet-stream',
              upsert: false,
            })

          if (uploadErr) {
            console.error(`${tag} Storage upload failed for ${att.filename}:`, uploadErr.message)
            continue
          }

          // Store the storage path directly (bucket is private — no public URLs)
          const fileUrl = storagePath

          // Insert record into pciq_email_documents
          const { data: insertData, error: insertErr } = await supabase.from('pciq_email_documents').insert({
            user_id: userId,
            email_from: fromAddr || null,
            email_subject: subject || null,
            filename: att.filename || null,
            file_url: fileUrl,
            file_size_bytes: fileSizeBytes,
            mime_type: att.content_type || null,
            document_type: null,
            classification_status: 'pending',
          }).select('id, file_url, filename, mime_type, user_id').single()

          if (insertErr) {
            console.error(`${tag} DB insert failed for ${att.filename}:`, insertErr.message)
            continue
          }

          stored.push(insertData)
          console.log(`${tag} ✅ Stored: ${att.filename} (${fileSizeBytes} bytes) → ${storagePath}`)

        } catch (attError) {
          console.error(`${tag} Error processing attachment ${att.filename}:`, attError.message)
        }
      }

      console.log(`${tag} Stored ${stored.length}/${docAttachments.length} documents for ${userData.email}`)

      // ── Stage 2: Classify each stored document ──
      for (const doc of stored) {
        try {
          const classification = await classifyDocument(doc)
          if (classification) {
            const docType = (classification.classification || 'unknown').toLowerCase()
            await supabase
              .from('pciq_email_documents')
              .update({
                document_type: docType,
                extracted_data: classification,
                classification_status: 'classified',
                updated_at: new Date().toISOString(),
              })
              .eq('id', doc.id)
            console.log(`${tag} Updated doc ${doc.id}: type=${docType}`)
          } else {
            await supabase
              .from('pciq_email_documents')
              .update({ classification_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', doc.id)
          }
        } catch (classErr) {
          console.error(`${tag} Classification failed for ${doc.filename}:`, classErr.message)
          await supabase
            .from('pciq_email_documents')
            .update({ classification_status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', doc.id)
        }
      }

      // ── Stage 3: Check completeness and auto-save if ready ──
      const currentBatchIds = stored.map(d => d.id)
      const completeness = await checkPolicyCompleteness(userId, currentBatchIds)
      let policySaved = false

      if (completeness.status === 'complete') {
        policySaved = await autoSavePolicy(userId, completeness)
        if (policySaved === true) {
          console.log(`${tag} 🎉 Policy auto-saved for ${userData.email}`)
        } else if (policySaved === 'exists') {
          console.log(`${tag} Policy already exists for ${userData.email} — skipping save`)
        }
      }

      // ── Stage 4: Send confirmation email ──
      // Only send for policy-related outcomes, not EOB/VET_BILL
      const hasOnlyNonPolicyDocs = stored.length > 0 && completeness.status === 'no_policy_docs'
      const hasPolicyOutcome = completeness.status === 'complete' || completeness.status === 'partial' || hasOnlyNonPolicyDocs
      if (hasPolicyOutcome && fromAddr) {
        // Extract sender email address (Resend may include name: "John <john@example.com>")
        const senderEmail = fromAddr.includes('<') ? fromAddr.match(/<([^>]+)>/)?.[1] || fromAddr : fromAddr
        await sendDocConfirmationEmail({
          toEmail: senderEmail,
          token,
          completeness,
          policySaved,
        })
      }

      console.log(`${tag} Done: stored=${stored.length} classified completeness=${completeness.status} policySaved=${policySaved}`)
      return res.status(200).json({ ok: true, stored: stored.length, completeness: completeness.status })

    } catch (error) {
      console.error(`${tag} Webhook error:`, error.message)
      // Always return 200 to prevent Resend retries
      return res.status(200).json({ ok: false, error: error.message })
    }
  })

  // ─── Admin Dashboard ──────────────────────────────────────────────────────
  // Admin login page — serves the gate, which fetches /admin/dashboard with header auth
  app.get('/admin', (req, res) => {
    res.setHeader('Content-Type', 'text/html')
    return res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pet ClaimIQ — Admin</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{font-size:15px;-webkit-font-smoothing:antialiased}
body{background:#0b0e14;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.login-box{background:#0d1117;border:1px solid #21262d;border-radius:16px;padding:40px;width:100%;max-width:360px;text-align:center}
.login-box h1{font-size:18px;font-weight:700;color:#e6edf3;margin-bottom:6px}
.login-box p{font-size:12px;color:#484f58;margin-bottom:24px}
.login-box input{width:100%;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 14px;font-size:14px;color:#e6edf3;outline:none;font-family:inherit;margin-bottom:12px;transition:border-color 0.15s}
.login-box input:focus{border-color:#58a6ff;box-shadow:0 0 0 3px rgba(88,166,255,0.15)}
.login-box button{width:100%;background:#238636;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.15s}
.login-box button:hover{background:#2ea043}
.login-box .error{color:#da6771;font-size:12px;margin-top:8px;display:none}
</style></head><body>
<div class="login-box" id="loginBox">
  <h1>Pet ClaimIQ Admin</h1>
  <p>Enter the admin key to continue.</p>
  <form id="loginForm">
    <input type="password" id="keyInput" placeholder="Admin key" autocomplete="off" autofocus>
    <button type="submit">Sign In</button>
    <div class="error" id="loginError">Invalid key. Try again.</div>
  </form>
</div>
<script>
(function() {
  var stored = sessionStorage.getItem('pciq_admin_key');
  if (stored) loadDashboard(stored);

  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var key = document.getElementById('keyInput').value.trim();
    if (!key) return;
    loadDashboard(key);
  });

  function loadDashboard(key) {
    fetch('/admin/dashboard', { headers: { 'X-Admin-Key': key } })
      .then(function(r) {
        if (r.status === 401) {
          sessionStorage.removeItem('pciq_admin_key');
          document.getElementById('loginError').style.display = 'block';
          document.getElementById('loginBox').style.display = '';
          return null;
        }
        return r.text();
      })
      .then(function(html) {
        if (!html) return;
        sessionStorage.setItem('pciq_admin_key', key);
        // Replace entire page with dashboard HTML — avoids all CSS conflicts
        document.open();
        document.write(html);
        document.close();
      });
  }
})();
</script>
</body></html>`)
  })

  app.get('/admin/dashboard', async (req, res) => {
    const tag = '[admin]'
    if (req.headers['x-admin-key'] !== 'PCIQ2026') {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      // ── Fetch all data in parallel ──
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const [analysesRes, policiesRes, usersRes, appealsRes, emailDocsRes] = await Promise.all([
        supabase.from('pciq_analyses')
          .select('id, user_id, policy_id, clinic_name, service_date, total_bill, estimated_reimbursement, status, line_items, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('pciq_policies')
          .select('id, user_id, carrier, pet_name, species, breed, deductible, reimbursement_rate, annual_limit, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('pciq_users')
          .select('id, email, free_analyses_remaining, is_subscribed, created_at'),
        supabase.from('pciq_appeals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('pciq_email_documents')
          .select('id, user_id, email_from, filename, document_type, classification_status, extracted_data, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      const analyses = analysesRes.data || []
      const policies = policiesRes.data || []
      const users = usersRes.data || []
      const appeals = appealsRes.data || []
      const emailDocs = emailDocsRes.data || []

      // Build user email lookup
      const userMap = {}
      users.forEach(u => { userMap[u.id] = u.email })

      // Build policy lookup for carrier/pet on analyses
      const policyMap = {}
      policies.forEach(p => { policyMap[p.id] = p })

      // ── User activity stats ──
      const userActivity = {}
      users.forEach(u => {
        userActivity[u.id] = { email: u.email, analyses: 0, policies: 0, lastActive: u.created_at, lastAnalysis: null, emailPolicies: 0 }
      })
      analyses.forEach(a => {
        if (!userActivity[a.user_id]) return
        userActivity[a.user_id].analyses++
        if (a.created_at > userActivity[a.user_id].lastActive) userActivity[a.user_id].lastActive = a.created_at
        if (!userActivity[a.user_id].lastAnalysis || a.created_at > userActivity[a.user_id].lastAnalysis) {
          userActivity[a.user_id].lastAnalysis = a.created_at
        }
      })
      policies.forEach(p => {
        if (!userActivity[p.user_id]) return
        userActivity[p.user_id].policies++
        if (p.created_at > userActivity[p.user_id].lastActive) userActivity[p.user_id].lastActive = p.created_at
      })
      // Count email-in policies per user
      emailDocs.forEach(d => {
        if (!userActivity[d.user_id]) return
        if (['combined', 'declarations'].includes(d.document_type) && d.classification_status === 'classified') {
          userActivity[d.user_id].emailPolicies++
        }
      })

      const activeUsers = Object.values(userActivity)
        .filter(u => u.lastActive >= thirtyDaysAgo)
        .sort((a, b) => b.lastActive.localeCompare(a.lastActive))

      // ── Collect unique carriers for filter dropdown ──
      const carrierSet = new Set()
      analyses.forEach(a => {
        const li = a.line_items || {}
        const c = li.carrier || policyMap[a.policy_id]?.carrier
        if (c) carrierSet.add(c)
      })
      const uniqueCarriers = [...carrierSet].sort()

      // ── Helper functions ──
      const esc = s => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const fmt = n => n != null ? '$' + Number(n).toFixed(2) : '—'
      const fmtDate = d => {
        if (!d) return '—'
        const dt = new Date(d)
        return dt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      }

      // ── Build analyses rows ──
      const analysisRows = analyses.map(a => {
        const li = a.line_items || {}
        const email = userMap[a.user_id] || '—'
        const petName = li.pet_name || policyMap[a.policy_id]?.pet_name || '—'
        const carrier = li.carrier || policyMap[a.policy_id]?.carrier || '—'
        const visitType = (li.visit_type || '—').replace(/_/g, ' ').replace(/visit$/i, '').trim()
        const covered = li.covered_total
        const excluded = li.excluded_total
        const confidence = li.confidence || '—'
        const reimb = a.estimated_reimbursement
        const reimbClass = reimb && Number(reimb) > 0 ? 'amt-positive' : 'amt-zero'
        const policyLabel = carrier !== '—'
          ? `<span class="carrier-name">${esc(carrier)}</span>` + (petName !== '—' ? `<span class="pet-sep"> · </span><span class="pet-name">${esc(petName)}</span>` : '')
          : '<span class="dim">—</span>'
        const statusBadge = a.status === 'disputed' ? '<span class="badge badge-warn">Disputed</span>'
          : a.status === 'filed' ? '<span class="badge badge-ok">Filed</span>'
          : a.status === 'paid' ? '<span class="badge badge-ok">Paid</span>'
          : '<span class="dim">—</span>'
        const confClass = confidence === 'High' ? 'conf-high' : confidence === 'Medium' ? 'conf-med' : confidence === 'Low' ? 'conf-low' : 'dim'
        return `<tr data-carrier="${esc(carrier)}">
          <td class="cell-date">${esc(fmtDate(a.created_at))}</td>
          <td class="cell-text">${esc(email)}</td>
          <td class="cell-policy">${policyLabel}</td>
          <td class="cell-text">${esc(visitType)}</td>
          <td class="cell-num">${fmt(a.total_bill)}</td>
          <td class="cell-num amt-covered">${fmt(covered)}</td>
          <td class="cell-num amt-excluded">${fmt(excluded)}</td>
          <td class="cell-num ${reimbClass}">${fmt(reimb)}</td>
          <td class="cell-center ${confClass}">${esc(confidence)}</td>
          <td class="cell-center">${statusBadge}</td>
        </tr>`
      }).join('\n')

      // ── Build policy rows ──
      const policyRows = policies.map(p => {
        const email = userMap[p.user_id] || '—'
        return `<tr>
          <td class="cell-date">${esc(fmtDate(p.created_at))}</td>
          <td class="cell-text">${esc(email)}</td>
          <td class="cell-text"><span class="carrier-name">${esc(p.carrier)}</span></td>
          <td class="cell-text"><span class="pet-name">${esc(p.pet_name)}</span></td>
          <td class="cell-text">${esc(p.species)}</td>
          <td class="cell-text">${esc(p.breed)}</td>
          <td class="cell-num">${fmt(p.deductible)}</td>
          <td class="cell-num">${p.reimbursement_rate != null ? p.reimbursement_rate + '%' : '—'}</td>
          <td class="cell-num">${p.annual_limit != null ? fmt(p.annual_limit) : 'Unlimited'}</td>
        </tr>`
      }).join('\n')

      // ── Build user activity rows ──
      const userRows = activeUsers.map(u => {
        return `<tr>
          <td class="cell-text">${esc(u.email)}</td>
          <td class="cell-date">${esc(fmtDate(u.lastActive))}</td>
          <td class="cell-date">${esc(u.lastAnalysis ? fmtDate(u.lastAnalysis) : '—')}</td>
          <td class="cell-num">${u.analyses}</td>
          <td class="cell-num">${u.policies}</td>
          <td class="cell-num">${u.emailPolicies || 0}</td>
        </tr>`
      }).join('\n')

      // ── Build email-in document rows ──
      const typeBadge = { combined: 'badge-ok', declarations: 'badge-ok', policy_terms: 'badge-ok', eob: 'badge-warn', vet_bill: 'badge-warn', irrelevant: 'badge-err' }
      const statusBadgeMap = { classified: 'badge-ok', pending: 'badge-warn', failed: 'badge-err' }
      const emailDocRows = emailDocs.map(d => {
        const ext = d.extracted_data || {}
        const dtype = d.document_type || 'pending'
        const dtypeBadge = typeBadge[dtype] || 'badge-dim'
        const stBadge = statusBadgeMap[d.classification_status] || 'badge-dim'
        return `<tr>
          <td class="cell-date">${esc(fmtDate(d.created_at))}</td>
          <td class="cell-text cell-truncate">${esc(d.email_from)}</td>
          <td class="cell-text cell-truncate" title="${esc(d.filename)}">${esc(d.filename)}</td>
          <td class="cell-center"><span class="badge ${dtypeBadge}">${esc(dtype)}</span></td>
          <td class="cell-center">${esc(ext.confidence)}</td>
          <td class="cell-text"><span class="carrier-name">${esc(ext.carrier_name)}</span></td>
          <td class="cell-text"><span class="pet-name">${esc(ext.pet_name)}</span></td>
          <td class="cell-center"><span class="badge ${stBadge}">${esc(d.classification_status)}</span></td>
        </tr>`
      }).join('\n')

      // ── Summary stats ──
      const totalAnalyses = analyses.length
      const totalPolicies = policies.length
      const totalUsers = users.length
      const recentAnalyses = analyses.filter(a => a.created_at >= thirtyDaysAgo).length
      const totalEmailDocs = emailDocs.length
      const policiesViaEmail = emailDocs.filter(d => ['combined', 'declarations'].includes(d.document_type) && d.classification_status === 'classified').length

      // ── Carrier filter options ──
      const carrierOptions = uniqueCarriers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')

      const emptyRow = (cols, msg) => `<tr class="empty-row"><td colspan="${cols}">${msg}</td></tr>`

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pet ClaimIQ — Admin</title>
<style>
  /* ── Reset & Base ── */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: 15px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  body { background: #0b0e14; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif; line-height: 1.5; }

  /* ── Nav ── */
  nav { background: #0d1117; padding: 0 32px; display: flex; align-items: center; height: 56px; gap: 32px; border-bottom: 1px solid #21262d; position: sticky; top: 0; z-index: 100; }
  nav .brand { font-size: 15px; font-weight: 700; color: #58a6ff; letter-spacing: -0.3px; }
  nav .nav-links { display: flex; gap: 4px; }
  nav a { color: #8b949e; text-decoration: none; font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 6px; transition: all 0.15s; }
  nav a:hover { color: #c9d1d9; background: #161b22; }

  /* ── Layout ── */
  .container { max-width: 1520px; margin: 0 auto; padding: 32px; }

  /* ── Stat Cards ── */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 48px; }
  .stat-card { background: #0d1117; border-radius: 12px; padding: 24px; border: 1px solid #21262d; }
  .stat-card .num { font-size: 36px; font-weight: 700; color: #e6edf3; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; line-height: 1; letter-spacing: -1px; }
  .stat-card .label { font-size: 12px; font-weight: 500; color: #484f58; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 8px; white-space: nowrap; }

  /* ── Section Headers ── */
  .section-header { display: flex; align-items: center; gap: 10px; margin-top: 48px; margin-bottom: 16px; }
  .section-header h2 { font-size: 18px; font-weight: 600; color: #e6edf3; letter-spacing: -0.2px; margin: 0; }
  .section-header .count { font-size: 14px; color: #484f58; font-weight: 500; }
  .section-header .spacer { flex: 1; }
  .section-header select { appearance: none; background: #0d1117 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238b949e' viewBox='0 0 16 16'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E") no-repeat right 12px center; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 32px 6px 12px; font-size: 13px; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
  .section-header select:hover { border-color: #58a6ff; }
  .section-header select:focus { outline: none; border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,0.15); }

  /* ── Tables ── */
  .table-wrap { overflow: visible; margin-bottom: 48px; border-radius: 12px; border: 1px solid #21262d; background: #0d1117; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 12px 16px; background: #0d1117; color: #484f58; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 1px solid #21262d; font-family: inherit; }
  th.r { text-align: right; }
  th.c { text-align: center; }
  td { padding: 0 16px; height: 46px; vertical-align: middle; font-size: 14px; white-space: nowrap; border: none; }
  tbody tr { border-bottom: 1px solid #161b22; }
  tbody tr:nth-child(odd) { background: #0d1117; }
  tbody tr:nth-child(even) { background: #111620; }
  tbody tr:hover { background: #161b22; }
  tbody tr:last-child { border-bottom: none; }

  /* ── Cell Types ── */
  .cell-date { color: #8b949e; font-size: 13px; }
  .cell-text { color: #c9d1d9; }
  .cell-num { text-align: right; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px; color: #c9d1d9; letter-spacing: -0.3px; }
  .cell-center { text-align: center; }
  .cell-policy { min-width: 180px; }
  .cell-truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }

  /* ── Semantic Colors (softer than neon) ── */
  .amt-covered { color: #3fb950; }
  .amt-excluded { color: #da6771; }
  .amt-positive { color: #3fb950; font-weight: 600; }
  .amt-zero { color: #484f58; }
  .carrier-name { color: #79c0ff; font-weight: 600; }
  .pet-name { color: #d2a8ff; font-weight: 500; }
  .pet-sep { color: #30363d; }
  .dim { color: #30363d; }

  /* ── Confidence ── */
  .conf-high { color: #3fb950; font-weight: 600; }
  .conf-med { color: #d29922; }
  .conf-low { color: #da6771; }

  /* ── Badges ── */
  .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; text-transform: capitalize; line-height: 1; }
  .badge-ok { background: rgba(63, 185, 80, 0.12); color: #3fb950; }
  .badge-warn { background: rgba(210, 153, 34, 0.12); color: #d29922; }
  .badge-err { background: rgba(218, 103, 113, 0.12); color: #da6771; }
  .badge-dim { background: rgba(139, 148, 158, 0.08); color: #484f58; }

  /* ── Empty State ── */
  .empty-row td { text-align: center; color: #30363d; font-size: 14px; font-style: italic; height: 80px; font-family: inherit; }

  /* ── Scroll targets ── */
  .section-header[id] { scroll-margin-top: 72px; }
</style>
</head>
<body>
<nav>
  <span class="brand">Pet ClaimIQ</span>
  <div class="nav-links">
    <a href="#stats">Overview</a>
    <a href="#analyses">Analyses</a>
    <a href="#policies">Policies</a>
    <a href="#emaildocs">Email-In</a>
    <a href="#users">Users</a>
  </div>
  <div style="margin-left:auto"><a href="#" onclick="sessionStorage.removeItem('pciq_admin_key');location.href='/admin';return false" style="color:#da6771;font-size:12px;text-decoration:none;">Logout</a></div>
</nav>
<div class="container">
  <div class="stats" id="stats">
    <div class="stat-card"><div class="num">${totalUsers}</div><div class="label">Users</div></div>
    <div class="stat-card"><div class="num">${recentAnalyses}</div><div class="label">Analyses (30d)</div></div>
    <div class="stat-card"><div class="num">${totalAnalyses}</div><div class="label">Analyses</div></div>
    <div class="stat-card"><div class="num">${totalPolicies}</div><div class="label">Policies</div></div>
    <div class="stat-card"><div class="num">${activeUsers.length}</div><div class="label">Active (30d)</div></div>
    <div class="stat-card"><div class="num">${totalEmailDocs}</div><div class="label">Docs Emailed</div></div>
    <div class="stat-card"><div class="num">${policiesViaEmail}</div><div class="label">Email Policies</div></div>
  </div>

  <div class="section-header" id="analyses">
    <h2>Analyses</h2>
    <span class="count">${totalAnalyses}</span>
    <div class="spacer"></div>
    <select id="carrierFilter" onchange="filterByCarrier()">
      <option value="">All carriers</option>
      ${carrierOptions}
    </select>
  </div>
  <div class="table-wrap">
  <table id="analysesTable">
    <thead><tr>
      <th>Date</th><th>User</th><th>Policy</th><th>Visit</th><th class="r">Bill</th><th class="r">Covered</th><th class="r">Excluded</th><th class="r">Reimb</th><th class="c">Conf</th><th class="c">Status</th>
    </tr></thead>
    <tbody>${analysisRows || emptyRow(10, 'No analyses yet')}</tbody>
  </table>
  </div>

  <div class="section-header" id="policies">
    <h2>Policies</h2>
    <span class="count">${totalPolicies}</span>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr>
      <th>Date</th><th>User</th><th>Carrier</th><th>Pet</th><th>Species</th><th>Breed</th><th class="r">Deductible</th><th class="r">Rate</th><th class="r">Limit</th>
    </tr></thead>
    <tbody>${policyRows || emptyRow(9, 'No policies yet')}</tbody>
  </table>
  </div>

  <div class="section-header" id="emaildocs">
    <h2>Email-In</h2>
    <span class="count">${totalEmailDocs}</span>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr>
      <th>Date</th><th>From</th><th>Filename</th><th class="c">Type</th><th class="c">Conf</th><th>Carrier</th><th>Pet</th><th class="c">Status</th>
    </tr></thead>
    <tbody>${emailDocRows || emptyRow(8, 'No email documents yet')}</tbody>
  </table>
  </div>

  <div class="section-header" id="users">
    <h2>Users</h2>
    <span class="count">${activeUsers.length} active</span>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr>
      <th>Email</th><th>Last Active</th><th>Last Analysis</th><th class="r">Analyses</th><th class="r">Policies</th><th class="r">Email</th>
    </tr></thead>
    <tbody>${userRows || emptyRow(6, 'No active users')}</tbody>
  </table>
  </div>
</div>

<script>
function filterByCarrier() {
  const val = document.getElementById('carrierFilter').value.toLowerCase();
  document.querySelectorAll('#analysesTable tbody tr').forEach(row => {
    if (!val) { row.style.display = ''; return; }
    row.style.display = (row.dataset.carrier || '').toLowerCase() === val ? '' : 'none';
  });
}
</script>
</body>
</html>`

      res.setHeader('Content-Type', 'text/html')
      return res.send(html)

    } catch (error) {
      console.error(`${tag} Error:`, error)
      return res.status(500).send('Dashboard error: ' + error.message)
    }
  })

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`)
  })
}

startServer()