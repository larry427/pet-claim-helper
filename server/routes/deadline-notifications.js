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
  if (!reminders?.length) return 'Friendly reminder: Your claim deadline is coming up 🐾'
  const first = reminders[0]
  if (reminders.length === 1) return `Don't miss your claim deadline for ${first.petName}! 🐾`
  return `We've got you covered - ${first.petName}'s claim needs attention (+${reminders.length - 1} more)`
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
          .header { background: #10b981; color: white; padding: 20px; border-radius: 8px; }
          .content { margin: 20px 0; }
          .greeting { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
          .closing { margin-top: 30px; font-size: 16px; line-height: 1.6; background: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
          a { color: #10b981; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .cta-button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 10px; }
          .cta-button:hover { background: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Don't Lose Money on Your Pet's Care 🐾</h1>
          </div>
          <div class="content">
            <div class="greeting">
              <p style="margin: 0 0 12px 0;">Hi there! 👋</p>
              <p style="margin: 0 0 12px 0;">We're checking in because we care about helping you get every dollar back from your pet insurance. Your furry family member deserves the best care, and we want to make sure you don't lose money on missed deadlines.</p>
              <p style="margin: 0; font-weight: bold;">Here are the claims that need your attention:</p>
            </div>
            ${items}
            <div class="closing">
              <p style="margin: 0 0 12px 0; font-weight: bold;">You've got this! We're here to help. 🐾</p>
              <p style="margin: 0 0 12px 0;">If you need any help filing these claims, just log into your dashboard and we'll walk you through it.</p>
              <p style="margin: 0;">
                <a href="${dashboardUrl}" class="cta-button">Go to My Dashboard</a>
              </p>
              <p style="margin: 16px 0 0 0; font-size: 14px;">Need help? Email us at <a href="mailto:larry@uglydogadventures.com" style="color: #10b981; text-decoration: underline;">larry@uglydogadventures.com</a></p>
              <p style="margin: 12px 0 0 0; font-size: 14px;">– The Pet Claim Helper Team</p>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #666; font-style: italic;">P.S. Never miss a deadline again - we'll always remind you!</p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">Pet Claim Helper - Because your pet's health matters, and so does your wallet. ❤️</p>
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
  return `Hi there! 👋

We're checking in because we care about helping you get every dollar back from your pet insurance. Your furry family member deserves the best care, and we want to make sure you don't lose money on missed deadlines.

Here are the claims that need your attention:

${lines}

You've got this! We're here to help. 🐾

If you need any help filing these claims, just log into your dashboard and we'll walk you through it.

Dashboard: ${dashboardUrl}

Need help? Email us at larry@uglydogadventures.com

– The Pet Claim Helper Team

P.S. Never miss a deadline again - we'll always remind you!`
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

  // PRIORITY 2: Generate unique execution ID for tracking
  const executionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  // eslint-disable-next-line no-console
  console.log(`[deadline-notifications] START execution ${executionId}`)

  // PRIORITY 1: Acquire execution lock to prevent concurrent runs
  const lockKey = `deadline-notifications-lock-${today.toISOString().split('T')[0]}`
  let lockAcquired = false

  try {
    const { error: lockError } = await supabase
      .from('execution_locks')
      .insert({ key: lockKey, created_at: new Date().toISOString() })

    if (lockError) {
      if (lockError.code === '23505') {
        // Lock already exists - another execution in progress
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] Already running, skipping (lock exists)`)
        return { success: false, reason: 'already_running', executionId }
      }
      throw lockError
    }

    lockAcquired = true
    // eslint-disable-next-line no-console
    console.log(`[deadline-notifications] [${executionId}] Lock acquired: ${lockKey}`)
  } catch (lockErr) {
    // eslint-disable-next-line no-console
    console.error(`[deadline-notifications] [${executionId}] Lock acquisition failed:`, lockErr)
    throw lockErr
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`[deadline-notifications] [${executionId}] Starting function`)

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
      console.log(`[deadline-notifications] [${executionId}] Processing user email: ${email}`)

      // PRIORITY 4: Re-check flags in database before sending (prevents race conditions)
      const validReminders = []
      for (const r of reminders) {
        const { data: freshClaim } = await supabase
          .from('claims')
          .select('sent_reminders')
          .eq('id', r.claimId)
          .single()

        if (freshClaim?.sent_reminders?.[r.flagKey]) {
          // eslint-disable-next-line no-console
          console.log(`[deadline-notifications] [${executionId}] Flag already set for claim ${r.claimId}, skipping`)
          continue
        }

        validReminders.push(r)
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] Sending reminder to: ${email} for claim: ${r.claimId}`)
      }

      // Skip if all reminders were filtered out
      if (!validReminders.length) {
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] No valid reminders for ${email} after flag check, skipping`)
        continue
      }

      const subject = buildSubject(validReminders)
      const html = buildEmailHtml(validReminders, dashboardUrl())
      const text = buildEmailText(validReminders, dashboardUrl())
      const from = 'Pet Claim Helper <reminders@petclaimhelper.com>'
      let result
      try {
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] Calling Resend API for ${email}`)
        const response = await resend.emails.send({ from, to: [email], subject, html, text })
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] Resend response:`, JSON.stringify(response))
        result = response
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[deadline-notifications] [${executionId}] Resend error:`, error)
        throw error
      }
      // eslint-disable-next-line no-console
      console.log(`[deadline-notifications] [${executionId}] Sent email to ${email}`, { id: result?.id, items: validReminders.length })
      emailsSent++

      // Update sent_reminders flags for included claims
      for (const r of validReminders) {
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
    console.log(`[deadline-notifications] [${executionId}] Finished. Emails sent:`, emailsSent)
    return { success: true, claimsChecked, remindersQueued, emailsSent, errors, executionId }
  } finally {
    // CLEANUP: Release the execution lock
    if (lockAcquired) {
      try {
        await supabase.from('execution_locks').delete().eq('key', lockKey)
        // eslint-disable-next-line no-console
        console.log(`[deadline-notifications] [${executionId}] Lock released: ${lockKey}`)
      } catch (cleanupErr) {
        // eslint-disable-next-line no-console
        console.error(`[deadline-notifications] [${executionId}] Failed to release lock:`, cleanupErr)
      }
    }
  }
}

export default { runDeadlineNotifications }