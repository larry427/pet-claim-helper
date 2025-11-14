// Test script to verify Twilio toll-free SMS functionality
// Tests if +18446256781 can actually send messages despite Error 30032 history

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import twilio from 'twilio'

// Load environment variables from .env.local (same directory)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '.env.local') })

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = '+18446256781' // Our toll-free number (shows "Approved" status)
const toNumber = '+13123050403' // Larry's phone

if (!accountSid || !authToken) {
  console.error('❌ ERROR: Twilio credentials not found in server/.env.local')
  console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'Found' : 'Missing')
  console.error('TWILIO_AUTH_TOKEN:', authToken ? 'Found' : 'Missing')
  process.exit(1)
}

const client = twilio(accountSid, authToken)

async function testSMS() {
  console.log('========================================')
  console.log('TWILIO SMS FUNCTIONALITY TEST')
  console.log('========================================')
  console.log(`From: ${fromNumber}`)
  console.log(`To: ${toNumber}`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log('----------------------------------------\n')

  try {
    console.log('Sending test message...\n')

    const message = await client.messages.create({
      body: 'Test message from Pet Claim Helper - Nov 13 @ 9:45 AM. If you receive this, SMS is working!',
      from: fromNumber,
      to: toNumber
    })

    console.log('✅ SUCCESS! Message sent successfully\n')
    console.log('MESSAGE DETAILS:')
    console.log('----------------------------------------')
    console.log(`Message SID: ${message.sid}`)
    console.log(`Status: ${message.status}`)
    console.log(`Direction: ${message.direction}`)
    console.log(`Price: ${message.price || 'Pending'}`)
    console.log(`Price Unit: ${message.priceUnit || 'N/A'}`)
    console.log(`Error Code: ${message.errorCode || 'None'}`)
    console.log(`Error Message: ${message.errorMessage || 'None'}`)
    console.log(`Date Created: ${message.dateCreated}`)
    console.log('----------------------------------------\n')

    console.log('RESULT: Toll-free number is FUNCTIONAL! ✅')
    console.log('The "Approved" status is accurate.')
    console.log('\nCheck your phone (+13123050403) for the test message.')

  } catch (error) {
    console.error('❌ FAILED! Message could not be sent\n')
    console.error('ERROR DETAILS:')
    console.error('----------------------------------------')
    console.error(`Error Code: ${error.code || 'Unknown'}`)
    console.error(`Error Message: ${error.message}`)
    console.error(`More Info: ${error.moreInfo || 'N/A'}`)
    console.error(`Status: ${error.status || 'N/A'}`)
    console.error('----------------------------------------\n')

    if (error.code === 30032) {
      console.error('RESULT: Error 30032 still present! ❌')
      console.error('The "Approved" status does NOT mean backend sync is complete.')
      console.error('Support ticket #24111496 is still needed.')
    } else {
      console.error(`RESULT: Different error encountered (${error.code})`)
      console.error('This may require separate investigation.')
    }

    console.error('\nFull error object:')
    console.error(JSON.stringify(error, null, 2))
  }

  console.log('\n========================================')
  console.log('TEST COMPLETE')
  console.log('========================================')
}

testSMS()
