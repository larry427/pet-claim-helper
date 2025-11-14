// Diagnostic test for Resend email functionality
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Resend } from 'resend'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '.env.local') })

console.log('========================================')
console.log('RESEND EMAIL DIAGNOSTICS')
console.log('========================================')
console.log(`Time: ${new Date().toISOString()}`)
console.log('----------------------------------------\n')

// Check API key
const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('❌ FATAL: RESEND_API_KEY not found in environment')
  process.exit(1)
}

console.log('✅ RESEND_API_KEY found')
console.log(`   Key prefix: ${apiKey.substring(0, 10)}...`)
console.log(`   Key length: ${apiKey.length} characters\n`)

// Initialize Resend
const resend = new Resend(apiKey)
console.log('✅ Resend client initialized\n')

// Test 1: Simple email
async function testSimpleEmail() {
  console.log('TEST 1: Sending simple test email')
  console.log('----------------------------------------')

  const emailData = {
    from: 'Pet Claim Helper <reminders@petclaimhelper.com>',
    to: ['larry@uglydogadventures.com'],
    subject: 'Resend Diagnostic Test - ' + new Date().toLocaleTimeString(),
    html: '<h1>Test Email</h1><p>This is a diagnostic test from Pet Claim Helper to verify Resend is working.</p>',
    text: 'This is a diagnostic test from Pet Claim Helper to verify Resend is working.'
  }

  console.log('Email configuration:')
  console.log(`  From: ${emailData.from}`)
  console.log(`  To: ${emailData.to.join(', ')}`)
  console.log(`  Subject: ${emailData.subject}\n`)

  try {
    console.log('Calling resend.emails.send()...\n')

    const response = await resend.emails.send(emailData)

    console.log('Raw Resend response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('')

    // Check response structure
    if (response.error) {
      console.error('❌ ERROR DETECTED IN RESPONSE')
      console.error('Error details:')
      console.error('  Name:', response.error.name)
      console.error('  Message:', response.error.message)
      console.error('  Status Code:', response.error.statusCode)
      console.error('')

      // Diagnose common errors
      if (response.error.message?.includes('domain')) {
        console.error('⚠️  DIAGNOSIS: Domain verification issue')
        console.error('   The domain "petclaimhelper.com" may not be verified in Resend.')
        console.error('   Go to: https://resend.com/domains')
        console.error('   Verify the domain has all DNS records set up correctly.')
      } else if (response.error.message?.includes('API key')) {
        console.error('⚠️  DIAGNOSIS: API key issue')
        console.error('   The API key may be invalid or revoked.')
        console.error('   Go to: https://resend.com/api-keys')
      } else if (response.error.statusCode === 429) {
        console.error('⚠️  DIAGNOSIS: Rate limit exceeded')
        console.error('   Too many requests. Wait and try again.')
      }

      return { success: false, error: response.error }
    }

    if (response.data?.id) {
      console.log('✅ SUCCESS! Email sent')
      console.log('Email details:')
      console.log(`  Message ID: ${response.data.id}`)
      console.log(`  Status: Sent to Resend`)
      console.log('')
      return { success: true, messageId: response.data.id }
    }

    // Unexpected response format
    console.warn('⚠️  WARNING: Unexpected response format')
    console.warn('Expected response.data.id but got:', response)
    return { success: false, error: 'Unexpected response format' }

  } catch (error) {
    console.error('❌ EXCEPTION THROWN')
    console.error('Error details:')
    console.error('  Type:', error.constructor.name)
    console.error('  Message:', error.message)
    console.error('  Stack:', error.stack)
    console.error('')

    if (error.message?.includes('fetch')) {
      console.error('⚠️  DIAGNOSIS: Network error')
      console.error('   Cannot reach Resend API. Check internet connection.')
    }

    return { success: false, error: error.message }
  }
}

// Run test
console.log('Starting email send test...\n')
const result = await testSimpleEmail()

console.log('========================================')
console.log('TEST SUMMARY')
console.log('========================================')
if (result.success) {
  console.log('✅ Resend is WORKING')
  console.log(`   Message ID: ${result.messageId}`)
  console.log('   Check larry@uglydogadventures.com inbox')
} else {
  console.log('❌ Resend is NOT WORKING')
  console.log(`   Error: ${result.error}`)
  console.log('')
  console.log('NEXT STEPS:')
  console.log('1. Check Resend dashboard: https://resend.com/emails')
  console.log('2. Verify domain: https://resend.com/domains')
  console.log('3. Check API key: https://resend.com/api-keys')
}
console.log('========================================')
