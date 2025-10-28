import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
console.log('RESEND_API_KEY:', RESEND_API_KEY ? 'Found' : 'Missing', RESEND_API_KEY?.substring(0, 10))

export const resend = new Resend(RESEND_API_KEY)

export function ensureResendConfigured() {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY missing. Add it to .env.local or environment.')
  }
}