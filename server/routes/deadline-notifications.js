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

function ensureClients({ supabase, resend }) {
  const supa =
    supabase ||
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
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
  const rows = reminders
    .map((r) => {
      const tag = r.kind === 'deadline_passed' ? 'DEADLINE PASSED' : `${r.daysRemaining} days`
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${r.petName}</strong></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${r.clinicName || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${r.serviceDate || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${r.deadline}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${tag}</td>
      </tr>`
    })
    .join('')
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <p>We detected claim filing deadlines approaching for the following items:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Pet</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Clinic</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Service date</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Deadline</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px">Take action here: <a href="${dashboardUrl}">${dashboardUrl}</a></p>
  </div>`
}

function buildEmailText(reminders, dashboardUrl) {
  const lines = reminders
    .map((r) => {
      const tag = r.kind === 'deadline_passed' ? 'DEADLINE PASSED' : `${r.daysRemaining} days`
      return `- ${r.petName} | ${r.clinicName || '—'} | service: ${r.serviceDate || '—'} | deadline: ${r.deadline} | ${tag}`
    })
    .join('\n')
  return `We detected claim filing deadlines approaching:\n\n${lines}\n\nDashboard: ${dashboardUrl}`
}

function dashboardUrl() {
  return (
    process.env.APP_DASHBOARD_URL || process.env.VITE_APP_DASHBOARD_URL || 'https://pet-claim-helper.app/dashboard'
  )
}

export async function runDeadlineNotifications(opts = {}) {
  const { supabase, resend } = ensureClients(opts)
  const today = startOfDayUtc()
  const errors = []

  // Query all relevant claims and join pets and profiles
  const { data, error } = await supabase
    .from('claims')
    .select([
      '*',
      'pets(name, user_id, filing_deadline_days)',
      'profiles(email)'
    ].join(', '))
    .in('filing_status', ['not_filed', 'filed'])
    .or('expense_category.eq.insured,insurance_type.eq.insured')

  if (error) throw error

  const claims = data || []
  const claimsChecked = claims.length

  // Build reminder intents per user (email)
  const remindersByUser = {}
  let remindersQueued = 0

  for (const claim of claims) {
    const userEmail = claim?.profiles?.email
    if (!userEmail) continue

    // Calculate deadline strictly from service_date + filing_deadline_days (prefer pets value)
    const serviceDate = claim?.service_date ? parseDateOnlyUTC(claim.service_date) : null
    if (!serviceDate) continue
    const petDeadlineDays = Number(claim?.pets?.filing_deadline_days)
    const claimDeadlineDays = Number(claim?.filing_deadline_days)
    const filingDays = Number.isFinite(petDeadlineDays)
      ? petDeadlineDays
      : Number.isFinite(claimDeadlineDays)
        ? claimDeadlineDays
        : 90
    const deadline = new Date(serviceDate)
    deadline.setUTCDate(deadline.getUTCDate() + filingDays)
    const daysRemaining = diffDays(today, deadline)

    const flags = claim?.sent_reminders || {}
    let key = null
    let include = false
    if (daysRemaining === 60 && flags.day_60 !== true) { key = 'day_60'; include = true }
    else if (daysRemaining === 30 && flags.day_30 !== true) { key = 'day_30'; include = true }
    else if (daysRemaining === 7 && flags.day_7 !== true) { key = 'day_7'; include = true }
    else if (daysRemaining < 0 && flags.deadline_passed !== true) { key = 'deadline_passed'; include = true }
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

  // Send batched emails per user and update flags
  let emailsSent = 0
  for (const [email, reminders] of Object.entries(remindersByUser)) {
    if (!reminders.length) continue
    try {
      const subject = buildSubject(reminders)
      const html = buildEmailHtml(reminders, dashboardUrl())
      const text = buildEmailText(reminders, dashboardUrl())
      const from = process.env.MAIL_FROM || 'Pet Claim Helper <no-reply@petclaimhelper.app>'
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

  return { success: true, claimsChecked, remindersQueued, emailsSent, errors }
}

export default { runDeadlineNotifications }


