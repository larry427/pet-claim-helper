import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function startOfDayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function parseDateOnlyUTC(s) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

function ensureClients({ supabase, resend } = {}) {
  const supa = supabase || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const rsnd = resend || new Resend(process.env.RESEND_API_KEY)
  return { supabase: supa, resend: rsnd }
}

function buildSubject(reminders) {
  if (!reminders?.length) return 'Your claim is expiring soon'
  const first = reminders[0]
  if (reminders.length === 1) return `Your claim for ${first.petName} is expiring soon`
  return `Your claim for ${first.petName} is expiring soon (+${reminders.length - 1} more)`
}

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
          .header { background: #007bff; color: white; padding: 20px; border-radius: 8px; }
          .content { margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
          a { color: #007bff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Claim Filing Deadline Alert</h1>
          </div>
          <div class="content">
            <p>We detected the following claim filing deadlines approaching:</p>
            ${items}
            <p style="margin-top: 20px;">
              <a href="${dashboardUrl}" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">View Dashboard</a>
            </p>
          </div>
          <div class="footer">
            <p>Pet Claim Helper - Never miss a claim deadline</p>
          </div>
        </div>
      </body>
    </html>
  `
}

function buildEmailText(reminders, dashboardUrl) {
  const lines = reminders
    .map((r) => {
      const tag = r.daysRemaining <= 0 ? 'DEADLINE PASSED' : `${r.daysRemaining} days`
      return `- ${r.petName} | ${r.clinicName || '—'} | service: ${r.serviceDate || '—'} | deadline: ${r.deadline} | ${tag}`
    })
    .join('\n')
  return `We detected claim filing deadlines approaching:\n\n${lines}\n\nDashboard: ${dashboardUrl}`
}

function dashboardUrl() {
  return (
    process.env.APP_DASHBOARD_URL || process.env.VITE_APP_DASHBOARD_URL || 'https://pet-claim-helper.vercel.app'
  )
}

export async function runDeadlineNotifications(opts = {}) {
  const { supabase, resend } = ensureClients(opts)
  const today = startOfDayUtc()
  const errors = []

  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Starting function')

  // Query all relevant claims and join pets and profiles
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('claims')
    .select('*, pets(name, filing_deadline_days), profiles(email)')
    .in('filing_status', ['not_filed', 'filed'])

  if (fallbackError) throw fallbackError

  // Calculate deadlines in JS
  const calculatedData = (fallbackData || []).map((claim) => {
    const serviceDate = claim?.service_date ? parseDateOnlyUTC(claim.service_date) : null
    if (!serviceDate) return null

    const petDeadlineDays = Number(claim?.pets?.filing_deadline_days)
    const claimDeadlineDays = Number(claim?.filing_deadline_days)
    const filingDays = Number.isFinite(petDeadlineDays)
      ? petDeadlineDays
      : Number.isFinite(claimDeadlineDays)
        ? claimDeadlineDays
        : 90

    const deadlineDate = new Date(serviceDate.getTime() + filingDays * 24 * 60 * 60 * 1000)
    return {
      ...claim,
      calculated_deadline: deadlineDate.toISOString().split('T')[0],
    }
  }).filter(Boolean)

  const claims = calculatedData || []
  const claimsChecked = claims.length
  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Claims fetched:', claimsChecked)

  // Build reminder intents per user (email)
  const remindersByUser = {}
  let remindersQueued = 0

  for (const claim of claims) {
    const userEmail = claim?.profiles?.email
    if (!userEmail) continue

    // Parse the calculated deadline
    const deadline = claim?.calculated_deadline ? parseDateOnlyUTC(claim.calculated_deadline) : null
    if (!deadline) {
      // eslint-disable-next-line no-console
      console.log('[deadline-notifications] Skipping claim (no deadline):', claim.id)
      continue
    }

    const daysRemaining = diffDays(today, deadline)

    const flags = claim?.sent_reminders || {}
    // eslint-disable-next-line no-console
    console.log('[deadline-notifications] Claim', claim.id, '- daysRemaining:', daysRemaining, 'flags:', flags)

    let key = null
    let include = false

    if (daysRemaining <= 7 && daysRemaining > 0 && flags.day_7 !== true) {
      key = 'day_7'
      include = true
    } else if (daysRemaining <= 30 && daysRemaining > 7 && flags.day_30 !== true) {
      key = 'day_30'
      include = true
    } else if (daysRemaining <= 60 && daysRemaining > 30 && flags.day_60 !== true) {
      key = 'day_60'
      include = true
    } else if (daysRemaining <= 0 && flags.deadline_passed !== true) {
      key = 'deadline_passed'
      include = true
    }

    if (!include || !key) continue

    if (!remindersByUser[userEmail]) remindersByUser[userEmail] = []
    remindersByUser[userEmail].push({
      claimId: claim.id,
      userId: claim.user_id,
      petName: claim?.pets?.name || 'your pet',
      clinicName: claim?.clinic_name || null,
      serviceDate: claim?.service_date || null,
      deadline: deadline.toISOString().slice(0, 10),
      daysRemaining,
      flagKey: key,
    })
    remindersQueued++
  }

  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Reminders to send:', remindersQueued)
  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Batched emails:', Object.keys(remindersByUser).length)

  // Send batched emails per user and update flags
  let emailsSent = 0
  for (const [email, reminders] of Object.entries(remindersByUser)) {
    if (!reminders.length) continue
    try {
      // eslint-disable-next-line no-console
      console.log(`[deadline-notifications] Processing user email: ${email}`)
      for (const r of reminders) {
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] Sending reminder to: ${email} for claim: ${r.claimId}`)
      }
      const subject = buildSubject(reminders)
      const html = buildEmailHtml(reminders, dashboardUrl())
      const text = buildEmailText(reminders, dashboardUrl())
      const from = 'Pet Claim Helper <reminders@petclaimhelper.com>'
      const result = await resend.emails.send({ from, to: [email], subject, html, text })
      // eslint-disable-next-line no-console
      console.log(`[deadline-notifications] Sent email to ${email}`, { id: result?.id, items: reminders.length })
      emailsSent++

      // Update sent_reminders flags for included claims
      for (const r of reminders) {
        try {
          const current = (claims.find((c) => c.id === r.claimId)?.sent_reminders) || {}
          const nextFlags = { ...current, [r.flagKey]: true }
          const { error: updErr } = await supabase
            .from('claims')
            .update({ sent_reminders: nextFlags })
            .eq('id', r.claimId)
          if (updErr) throw updErr
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[deadline-notifications] Failed to update sent_reminders for claim', r.claimId, e)
          errors.push({ type: 'update', claimId: r.claimId, error: String(e?.message || e) })
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[deadline-notifications] Email send failed for', email, e)
      errors.push({ type: 'email', email, error: String(e?.message || e) })
    }
  }

  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Finished. Emails sent:', emailsSent)
  return { success: true, claimsChecked, remindersQueued, emailsSent, errors }
}

export default { runDeadlineNotifications }