import { supabase } from '../lib/supabase'

type ClaimWithJoins = {
  id: string
  user_id: string
  pet_id: string | null
  deadline_date: string | null
  filing_status: string | null
  sent_reminders: Record<string, any> | null
  pets?: { name?: string | null } | null
  profiles?: { email?: string | null; full_name?: string | null } | null
}

function getTodayUtcDateOnly(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function parseDateUTC(dateStr: string): Date | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function diffDaysUtc(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

function getDashboardUrl(): string {
  // Prefer Vite env if available, otherwise fall back to process.env, otherwise default
  const viteUrl = (import.meta as any)?.env?.VITE_APP_DASHBOARD_URL
  const nodeUrl = (typeof process !== 'undefined' && (process as any)?.env?.APP_DASHBOARD_URL) || undefined
  return (viteUrl || nodeUrl || 'https://pet-claim-helper.app/dashboard') as string
}

async function loadResendClient(): Promise<any> {
  try {
    // Load server-side configured Resend client if available
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const mod: any = await import('../../server/lib/resendClient.js')
    if (typeof mod.ensureResendConfigured === 'function') mod.ensureResendConfigured()
    if (mod.resend) return mod.resend
  } catch (_) {
    // no-op: fall through to direct Resend construction
  }
  // Fallback: construct a client directly (expects RESEND_API_KEY in env when running in Node)
  const { Resend } = await import('resend')
  const apiKey = (typeof process !== 'undefined' && (process as any)?.env?.RESEND_API_KEY) || ''
  if (!apiKey) {
    throw new Error('RESEND_API_KEY missing. Configure server/lib/resendClient.js or set RESEND_API_KEY.')
  }
  return new Resend(apiKey)
}

function getReminderKey(daysRemaining: number): { key: string; label: string } | null {
  if (daysRemaining === 60) return { key: '60day_reminder_sent', label: '60-day' }
  if (daysRemaining === 30) return { key: '30day_reminder_sent', label: '30-day' }
  if (daysRemaining === 7) return { key: '7day_reminder_sent', label: '7-day' }
  return null
}

export async function sendDeadlineReminders() {
  const today = getTodayUtcDateOnly()
  let sentCount = 0
  const errors: Array<{ claimId: string; error: unknown }> = []

  // Fetch eligible claims
  const { data, error } = await supabase
    .from('claims')
    .select(
      [
        'id',
        'user_id',
        'pet_id',
        'deadline_date',
        'filing_status',
        'sent_reminders',
        'pets(name)',
        'profiles(email,full_name)'
      ].join(', ')
    )
    .in('filing_status', ['submitted', 'pending'])
    .not('deadline_date', 'is', null)
    .gt('deadline_date', today.toISOString().slice(0, 10))

  if (error) throw error

  const claims = (data || []) as ClaimWithJoins[]
  if (!claims.length) return { sent: 0, errors }

  const resend = await loadResendClient()
  const dashboardUrl = getDashboardUrl()

  for (const claim of claims) {
    try {
      const deadline = claim.deadline_date ? parseDateUTC(claim.deadline_date) : null
      if (!deadline) continue
      const daysRemaining = diffDaysUtc(today, deadline)
      const keyInfo = getReminderKey(daysRemaining)
      if (!keyInfo) continue

      const alreadySent = Boolean((claim.sent_reminders || {})[keyInfo.key])
      if (alreadySent) continue

      const toEmail = claim.profiles?.email || undefined
      const petName = claim.pets?.name || 'your pet'
      if (!toEmail) continue

      const subject = `Claim Filing Deadline Alert: ${petName} - ${daysRemaining} days left`
      const filingDeadlineStr = claim.deadline_date
      const text = `Your claim for ${petName} is due ${filingDeadlineStr}. File now to avoid denial.\n\nDashboard: ${dashboardUrl}`

      // Send email
      // Note: Ensure your sending domain is verified in Resend; adjust the from address accordingly.
      await resend.emails.send({
        from: 'Pet Claim Helper <no-reply@petclaimhelper.app>',
        to: [toEmail],
        subject,
        text,
      })

      // Update sent_reminders JSONB flag
      const newFlags = { ...(claim.sent_reminders || {}), [keyInfo.key]: true }
      const { error: updErr } = await supabase
        .from('claims')
        .update({ sent_reminders: newFlags })
        .eq('id', claim.id)
      if (updErr) throw updErr

      sentCount += 1
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[deadline-reminders] Failed sending reminder for claim', claim.id, e)
      errors.push({ claimId: claim.id, error: e })
    }
  }

  return { sent: sentCount, errors }
}

export default sendDeadlineReminders


