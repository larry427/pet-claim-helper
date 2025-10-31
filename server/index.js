import fetch from 'node-fetch'
global.fetch = fetch
import dotenv from 'dotenv'
dotenv.config({ path: process.env.ENV_PATH || '.env.local' })

import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getReminderEmailHtml } from './emailTemplates.js'
import medicationRemindersRouter from './routes/medication-reminders.js'

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

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Routes
app.use('/api/medication-reminders', medicationRemindersRouter)

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
  
  const port = process.env.PORT || 8787
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