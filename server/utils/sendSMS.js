import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

// Initialize a singleton SNS client using environment variables
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
const accessKeyId = process.env.AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

const sns = new SNSClient({
	region,
	credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
})

function normalizePhoneNumber(input) {
	if (!input) return ''
	// Keep leading + and digits; remove spaces/dashes/parentheses
	const trimmed = String(input).trim()
	const normalized = trimmed.replace(/[^\d+]/g, '')
	// Ensure a leading + exists if it looks like a US number missing '+'
	if (!normalized.startsWith('+') && /^\d+$/.test(normalized)) {
		return `+${normalized}`
	}
	return normalized
}

export async function sendSMS(phoneNumber, message) {
	const timestamp = new Date().toISOString()
	const to = normalizePhoneNumber(phoneNumber)

	console.log('[SMS] Preparing to send', { phoneNumber: to, message })

	if (!to || !message) {
		const error = 'Missing phoneNumber or message'
		console.error('[SMS] Error:', error)
		return { success: false, messageId: null, phoneNumber: to || phoneNumber, timestamp, error }
	}

	try {
		const cmd = new PublishCommand({
			PhoneNumber: to,
			Message: String(message),
		})
		const res = await sns.send(cmd)
		const messageId = res?.MessageId || null
		console.log('[SMS] Sent', { phoneNumber: to, messageId })
		return { success: true, messageId, phoneNumber: to, timestamp }
	} catch (err) {
		console.error('[SMS] Failed', { phoneNumber: to, error: err?.message || String(err) })
		return {
			success: false,
			messageId: null,
			phoneNumber: to,
			timestamp,
			error: err?.message || String(err),
		}
	}
}


