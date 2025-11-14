// Test script to send branded SMS medication reminder to Larry
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import twilio from 'twilio'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '.env.local') })

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18446256781'
const toNumber = '+13123050403' // Larry's phone

if (!accountSid || !authToken) {
  console.error('❌ ERROR: Twilio credentials not found')
  console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'Found' : 'Missing')
  console.error('TWILIO_AUTH_TOKEN:', authToken ? 'Found' : 'Missing')
  process.exit(1)
}

const client = twilio(accountSid, authToken)

async function sendTestSMS() {
  console.log('========================================')
  console.log('BRANDED SMS MEDICATION REMINDER TEST')
  console.log('========================================')
  console.log(`Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`)
  console.log(`From: ${fromNumber}`)
  console.log(`To: ${toNumber}`)
  console.log('----------------------------------------\n')

  // Create fake medication scenario
  const petName = 'Buddy'
  const medName = 'Heart medication'
  const deepLink = 'https://pet-claim-helper.vercel.app/dose/test123?action=mark'

  // Use the new branded template from medication-reminders.js
  const message = `🐾 Time to give ${petName} their ${medName}! Tap to mark as given: ${deepLink} Reply HELP for help.`

  try {
    console.log('📱 Sending branded SMS...\n')
    console.log('PREVIEW:')
    console.log(`Message: ${message}`)
    console.log(`Length: ${message.length} characters`)
    console.log('----------------------------------------\n')

    const response = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber
    })

    console.log('✅ SUCCESS! Branded SMS sent\n')
    console.log('SMS DETAILS:')
    console.log('----------------------------------------')
    console.log(`Message SID: ${response.sid}`)
    console.log(`Status: ${response.status}`)
    console.log(`Direction: ${response.direction}`)
    console.log(`From: ${response.from}`)
    console.log(`To: ${response.to}`)
    console.log(`Price: ${response.price || 'Pending'}`)
    console.log(`Date Created: ${response.dateCreated}`)
    console.log('----------------------------------------\n')

    console.log('WHAT LARRY WILL SEE ON HIS PHONE:')
    console.log('✅ 🐾 emoji at start (warm, branded)')
    console.log('✅ "Time to give Buddy their Heart medication!"')
    console.log('✅ "Tap to mark as given:" (mobile-friendly)')
    console.log('✅ Deep link for one-tap action')
    console.log('✅ "Reply HELP for help" (helpful support)')
    console.log(`✅ ${message.length} chars (under 160, single SMS cost)`)

  } catch (error) {
    console.error('❌ FAILED! SMS could not be sent\n')
    console.error('ERROR DETAILS:')
    console.error('----------------------------------------')
    console.error(`Error Code: ${error.code || 'Unknown'}`)
    console.error(`Error Message: ${error.message}`)
    console.error(`More Info: ${error.moreInfo || 'N/A'}`)
    console.error('----------------------------------------')
    console.error(JSON.stringify(error, null, 2))
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('TEST COMPLETE')
  console.log('========================================')
  console.log('\n📱 Check your phone (+13123050403) for the branded SMS!')
}

sendTestSMS()
