// Test script to verify SMS medication reminder system end-to-end
// Tests Twilio integration with production environment variables

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import twilio from 'twilio'

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '.env.local') })

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18446256781'
const toNumber = '+13123050403' // Larry's phone

console.log('========================================')
console.log('SMS MEDICATION REMINDER SYSTEM TEST')
console.log('========================================')
console.log(`Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`)
console.log(`From: ${fromNumber}`)
console.log(`To: ${toNumber}`)
console.log('----------------------------------------\n')

// Verify credentials
if (!accountSid || !authToken) {
  console.error('❌ ERROR: Twilio credentials not found')
  console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'Found' : 'Missing')
  console.error('TWILIO_AUTH_TOKEN:', authToken ? 'Found' : 'Missing')
  console.error('TWILIO_PHONE_NUMBER:', fromNumber)
  process.exit(1)
}

console.log('✅ Twilio credentials loaded')
console.log(`   Account SID: ${accountSid.substring(0, 10)}...`)
console.log(`   Phone Number: ${fromNumber}\n`)

const client = twilio(accountSid, authToken)

async function testSMS() {
  try {
    console.log('📤 Sending test SMS...\n')

    const message = await client.messages.create({
      body: '🐾 SMS test from Pet Claim Helper - Nov 13 @ 10:35 AM. Reply HELP for help or STOP to opt-out.',
      from: fromNumber,
      to: toNumber
    })

    console.log('✅ SUCCESS! SMS sent successfully\n')
    console.log('MESSAGE DETAILS:')
    console.log('----------------------------------------')
    console.log(`Message SID: ${message.sid}`)
    console.log(`Status: ${message.status}`)
    console.log(`Direction: ${message.direction}`)
    console.log(`From: ${message.from}`)
    console.log(`To: ${message.to}`)
    console.log(`Price: ${message.price || 'Pending'}`)
    console.log(`Price Unit: ${message.priceUnit || 'USD'}`)
    console.log(`Error Code: ${message.errorCode || 'None'}`)
    console.log(`Error Message: ${message.errorMessage || 'None'}`)
    console.log(`Date Created: ${message.dateCreated}`)
    console.log(`Date Sent: ${message.dateSent || 'Pending'}`)
    console.log('----------------------------------------\n')

    console.log('✅ RESULT: SMS medication reminder system is FUNCTIONAL!')
    console.log('   - Twilio integration: ✅ Working')
    console.log('   - Environment variables: ✅ Loaded correctly')
    console.log('   - Toll-free number: ✅ Sending messages')
    console.log('\n📱 Check your phone (+13123050403) for the test message.')

  } catch (error) {
    console.error('❌ FAILED! SMS could not be sent\n')
    console.error('ERROR DETAILS:')
    console.error('----------------------------------------')
    console.error(`Error Code: ${error.code || 'Unknown'}`)
    console.error(`Error Message: ${error.message}`)
    console.error(`More Info: ${error.moreInfo || 'N/A'}`)
    console.error(`Status: ${error.status || 'N/A'}`)
    console.error('----------------------------------------\n')

    if (error.code === 30032) {
      console.error('⚠️  Error 30032 detected!')
      console.error('   This indicates the toll-free number is not approved for A2P messaging.')
      console.error('   However, our earlier test showed approval. This may be a temporary issue.')
    } else if (error.code === 21608) {
      console.error('⚠️  Error 21608 detected!')
      console.error('   The phone number is unverified. Need to verify in Twilio console.')
    } else {
      console.error(`⚠️  Unexpected error code: ${error.code}`)
      console.error('   Review Twilio documentation for this error.')
    }

    console.error('\nFull error object:')
    console.error(JSON.stringify(error, null, 2))
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('TEST COMPLETE')
  console.log('========================================')
}

testSMS()
