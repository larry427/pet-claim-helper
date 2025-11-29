import twilio from 'twilio'
import { formatPhoneToE164 } from './phoneUtils.js'

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+18446256781'

let twilioClient = null
if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken)
}

export async function sendTwilioSMS(phoneNumber, message) {
  const timestamp = new Date().toISOString()
  const to = formatPhoneToE164(phoneNumber)

  console.log('[Twilio SMS] Preparing to send', { phoneNumber: to, message })

  if (!twilioClient) {
    const error = 'Twilio client not initialized - missing credentials'
    console.error('[Twilio SMS] Error:', error)
    return { success: false, messageId: null, phoneNumber: to || phoneNumber, timestamp, error }
  }

  if (!to || !message) {
    const error = 'Missing phoneNumber or message'
    console.error('[Twilio SMS] Error:', error)
    return { success: false, messageId: null, phoneNumber: to || phoneNumber, timestamp, error }
  }

  try {
    const response = await twilioClient.messages.create({
      body: String(message),
      from: twilioPhone,
      to: to,
    })

    const messageId = response?.sid || null
    console.log('[Twilio SMS] Sent', { phoneNumber: to, messageId, status: response?.status })
    return { success: true, messageId, phoneNumber: to, timestamp, status: response?.status }
  } catch (err) {
    console.error('[Twilio SMS] Failed', { phoneNumber: to, error: err?.message || String(err) })
    return {
      success: false,
      messageId: null,
      phoneNumber: to,
      timestamp,
      error: err?.message || String(err),
    }
  }
}

// Generate TwiML response for webhooks
export function generateTwiMLResponse(message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`
}
