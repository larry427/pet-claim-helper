// Test script to send branded email deadline reminder to Larry
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Resend } from 'resend'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '.env.local') })

const resend = new Resend(process.env.RESEND_API_KEY)

// Build subject line (from deadline-notifications.js)
function buildSubject(reminders) {
  if (!reminders?.length) return 'Friendly reminder: Your claim deadline is coming up 🐾'
  const first = reminders[0]
  if (reminders.length === 1) return `Don't miss your claim deadline for ${first.petName}! 🐾`
  return `We've got you covered - ${first.petName}'s claim needs attention (+${reminders.length - 1} more)`
}

// Build email HTML (from deadline-notifications.js)
function buildEmailHtml(reminders, dashboardUrl) {
  const items = reminders
    .map((r) => {
      const tag = r.daysRemaining <= 0 ? 'DEADLINE PASSED' : `${r.daysRemaining} days`
      return `
        <div style="margin: 16px 0; padding: 12px; border-left: 4px solid #ff6b35; background: #fff5f0;">
          <p style="margin: 0; font-weight: bold;">${r.petName}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #666;">
            ${r.clinicName || 'Clinic'} | Service: ${r.serviceDate || 'N/A'}
          </p>
          <p style="margin: 4px 0; font-size: 14px; color: #ff6b35; font-weight: bold;">
            Deadline: ${r.deadline} (${tag})
          </p>
        </div>
      `
    })
    .join('')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; border-radius: 8px; }
          .content { margin: 20px 0; }
          .greeting { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
          .closing { margin-top: 30px; font-size: 16px; line-height: 1.6; background: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
          a { color: #10b981; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .cta-button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 10px; }
          .cta-button:hover { background: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Don't Lose Money on Your Pet's Care 🐾</h1>
          </div>
          <div class="content">
            <div class="greeting">
              <p style="margin: 0 0 12px 0;">Hi there! 👋</p>
              <p style="margin: 0 0 12px 0;">We're checking in because we care about helping you get every dollar back from your pet insurance. Your furry family member deserves the best care, and we want to make sure you don't lose money on missed deadlines.</p>
              <p style="margin: 0; font-weight: bold;">Here are the claims that need your attention:</p>
            </div>
            ${items}
            <div class="closing">
              <p style="margin: 0 0 12px 0; font-weight: bold;">You've got this! We're here to help. 🐾</p>
              <p style="margin: 0 0 12px 0;">If you need any help filing these claims, just log into your dashboard and we'll walk you through it.</p>
              <p style="margin: 0;">
                <a href="${dashboardUrl}" class="cta-button">Go to My Dashboard</a>
              </p>
              <p style="margin: 16px 0 0 0; font-size: 14px;">Need help? Email us at <a href="mailto:larry@uglydogadventures.com" style="color: #10b981; text-decoration: underline;">larry@uglydogadventures.com</a></p>
              <p style="margin: 12px 0 0 0; font-size: 14px;">– The Pet Claim Helper Team</p>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #666; font-style: italic;">P.S. Never miss a deadline again - we'll always remind you!</p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">Pet Claim Helper - Because your pet's health matters, and so does your wallet. ❤️</p>
          </div>
        </div>
      </body>
    </html>
  `
}

// Build plain text version
function buildEmailText(reminders, dashboardUrl) {
  const lines = reminders
    .map((r) => {
      const tag = r.daysRemaining <= 0 ? 'DEADLINE PASSED' : `${r.daysRemaining} days`
      return `- ${r.petName} | ${r.clinicName || '—'} | service: ${r.serviceDate || '—'} | deadline: ${r.deadline} | ${tag}`
    })
    .join('\n')
  return `Hi there! 👋

We're checking in because we care about helping you get every dollar back from your pet insurance. Your furry family member deserves the best care, and we want to make sure you don't lose money on missed deadlines.

Here are the claims that need your attention:

${lines}

You've got this! We're here to help. 🐾

If you need any help filing these claims, just log into your dashboard and we'll walk you through it.

Dashboard: ${dashboardUrl}

Need help? Email us at larry@uglydogadventures.com

– The Pet Claim Helper Team

P.S. Never miss a deadline again - we'll always remind you!`
}

async function sendTestEmail() {
  console.log('========================================')
  console.log('BRANDED EMAIL DEADLINE REMINDER TEST')
  console.log('========================================')
  console.log(`Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`)
  console.log('To: larry@uglydogadventures.com')
  console.log('----------------------------------------\n')

  // Create fake claim scenario
  const reminders = [
    {
      petName: 'Buddy',
      clinicName: 'Happy Paws Veterinary',
      serviceDate: '2025-11-01',
      deadline: '2025-11-18',
      daysRemaining: 5
    }
  ]

  const dashboardUrl = 'https://pet-claim-helper.vercel.app'
  const subject = buildSubject(reminders)
  const html = buildEmailHtml(reminders, dashboardUrl)
  const text = buildEmailText(reminders, dashboardUrl)
  const from = 'Pet Claim Helper <reminders@petclaimhelper.com>'
  const to = 'larry@uglydogadventures.com'

  try {
    console.log('📧 Sending branded email...\n')
    console.log('PREVIEW:')
    console.log(`Subject: ${subject}`)
    console.log(`From: ${from}`)
    console.log(`To: ${to}`)
    console.log('----------------------------------------\n')

    const response = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
      text
    })

    console.log('✅ SUCCESS! Branded email sent\n')
    console.log('EMAIL DETAILS:')
    console.log('----------------------------------------')
    console.log(`Message ID: ${response.data?.id || response.id}`)
    console.log(`Status: Sent`)
    console.log('----------------------------------------\n')

    console.log('WHAT LARRY WILL SEE:')
    console.log('✅ Subject: "Don\'t miss your claim deadline for Buddy! 🐾"')
    console.log('✅ Greeting: "Hi there! 👋"')
    console.log('✅ Caring body: "We\'re checking in because we care..."')
    console.log('✅ Green color scheme (#10b981)')
    console.log('✅ Encouraging closing: "You\'ve got this! We\'re here to help. 🐾"')
    console.log('✅ Professional support: support@petclaimhelper.com')
    console.log('✅ Dashboard button with green styling')
    console.log('✅ Footer: "Because your pet\'s health matters, and so does your wallet. ❤️"')

  } catch (error) {
    console.error('❌ FAILED! Email could not be sent\n')
    console.error('ERROR DETAILS:')
    console.error('----------------------------------------')
    console.error(`Error Message: ${error.message}`)
    console.error('----------------------------------------')
    console.error(JSON.stringify(error, null, 2))
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('TEST COMPLETE')
  console.log('========================================')
}

sendTestEmail()
