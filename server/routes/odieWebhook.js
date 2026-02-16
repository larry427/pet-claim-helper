/**
 * Odie Pet Insurance — Webhook Receiver
 *
 * Receives POST callbacks from Odie when claim or policy statuses change.
 * Logs every event to the `odie_webhook_logs` table and updates the matching
 * PCH claim when a CLAIM webhook arrives. Sends SMS + email notifications
 * to the user when their claim status changes.
 *
 * Endpoint:
 *   POST /api/odie/webhook
 *
 * No authentication is required — Odie calls this endpoint directly.
 * TODO: Add webhook secret verification once Odie provides a signing secret.
 */

import { Router } from 'express'
import { sendTwilioSMS } from '../utils/sendTwilioSMS.js'

const router = Router()

// ---------------------------------------------------------------------------
// Supabase client (lazy — dynamic import avoids top-level ESM resolution issues)
// ---------------------------------------------------------------------------

let _supabase = null

async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js')
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return _supabase
}

// Resend client (lazy — same pattern)
let _resend = null

async function getResend() {
  if (!_resend) {
    const { Resend } = await import('resend')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

// ---------------------------------------------------------------------------
// Odie status → PCH filing_status mapping
// ---------------------------------------------------------------------------

const ODIE_STATUS_TO_FILING = {
  CLAIMSUBMITTED:            'submitted',
  CLAIMUNDERREVIEW:          'submitted',
  CLAIMNEEDSUSERACTION:      'submitted',
  CLAIMAPPROVED:             'filed',
  CLAIMCLOSEDPAYMENTPENDING: 'filed',
  CLAIMDENIED:               'denied',
  CLAIMCLOSEDPAID:           'paid',
}

// ---------------------------------------------------------------------------
// Friendly status messages for notifications
// ---------------------------------------------------------------------------

const ODIE_STATUS_FRIENDLY = {
  CLAIMSUBMITTED:            'has been submitted',
  CLAIMUNDERREVIEW:          'is under review',
  CLAIMNEEDSUSERACTION:      'needs your attention — additional documents may be required',
  CLAIMAPPROVED:             'has been approved',
  CLAIMDENIED:               'has been denied',
  CLAIMCLOSEDPAID:           'has been paid',
  CLAIMCLOSEDPAYMENTPENDING: 'has been approved — payment is pending',
}

function getFriendlyStatus(odieStatus) {
  return ODIE_STATUS_FRIENDLY[odieStatus] || `status updated to ${odieStatus}`
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

async function sendClaimNotifications(supabase, { claimId, claimNumber, odieStatus, amountPaid }) {
  // Look up claim → pet → user profile
  const { data: claimRow, error: claimErr } = await supabase
    .from('claims')
    .select('pet_id, user_id')
    .eq('id', claimId)
    .single()

  if (claimErr || !claimRow) {
    console.warn(`[Odie Webhook] Could not look up claim ${claimId} for notifications:`, claimErr?.message)
    return
  }

  // Get pet name
  let petName = 'your pet'
  if (claimRow.pet_id) {
    const { data: pet } = await supabase
      .from('pets')
      .select('name')
      .eq('id', claimRow.pet_id)
      .single()
    if (pet?.name) petName = pet.name
  }

  // Get user profile (email, phone, sms_opt_in, full_name)
  if (!claimRow.user_id) {
    console.warn(`[Odie Webhook] Claim ${claimId} has no user_id — skipping notifications`)
    return
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('email, phone, sms_opt_in, full_name')
    .eq('id', claimRow.user_id)
    .single()

  if (profileErr || !profile) {
    console.warn(`[Odie Webhook] Could not look up profile for user ${claimRow.user_id}:`, profileErr?.message)
    return
  }

  const friendly = getFriendlyStatus(odieStatus)
  const reimbursementNote = amountPaid > 0 ? `Reimbursement: $${amountPaid.toFixed(2)}. ` : ''

  // --- SMS notification ---
  if (profile.sms_opt_in && profile.phone) {
    try {
      const smsBody =
        `\uD83D\uDC3E PCH Update: Your claim for ${petName} ${friendly}. ` +
        reimbursementNote +
        'View details: https://pet-claim-helper.vercel.app'

      const result = await sendTwilioSMS(profile.phone, smsBody)
      if (result.success) {
        console.log(`[Odie Webhook] SMS sent to ${profile.phone} for claim ${claimNumber}`)
      } else {
        console.error(`[Odie Webhook] SMS failed for claim ${claimNumber}:`, result.error)
      }
    } catch (smsErr) {
      console.error(`[Odie Webhook] SMS error for claim ${claimNumber}:`, smsErr.message)
    }
  }

  // --- Email notification ---
  if (profile.email) {
    try {
      const resend = await getResend()
      const firstName = profile.full_name?.split(' ')[0] || 'there'

      const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0d9488; margin: 0 0 16px;">Claim Update</h2>
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    Hi ${firstName},
  </p>
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    Your claim for <strong>${petName}</strong> ${friendly}.
  </p>
  ${amountPaid > 0 ? `<p style="color: #334155; font-size: 16px; line-height: 1.6;">Reimbursement amount: <strong>$${amountPaid.toFixed(2)}</strong></p>` : ''}
  <p style="margin: 24px 0;">
    <a href="https://pet-claim-helper.vercel.app" style="display: inline-block; padding: 12px 24px; background: #0d9488; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">View Your Dashboard</a>
  </p>
  <p style="color: #94a3b8; font-size: 13px;">— Pet Claim Helper</p>
</div>`

      await resend.emails.send({
        from: 'Pet Claim Helper <notifications@petclaimhelper.com>',
        to: [profile.email],
        subject: `Claim Update: ${petName}`,
        html,
      })

      console.log(`[Odie Webhook] Email sent to ${profile.email} for claim ${claimNumber}`)
    } catch (emailErr) {
      console.error(`[Odie Webhook] Email error for claim ${claimNumber}:`, emailErr.message)
    }
  }
}

// ---------------------------------------------------------------------------
// Claim webhook processor
// ---------------------------------------------------------------------------

async function processClaimWebhook(supabase, { claim, claimNumber, logId }) {
  if (!claimNumber) {
    console.warn('[Odie Webhook] CLAIM entity but no claimNumber in payload')
    return
  }

  const odieStatus = claim.status || null
  const amountPaid = Number(claim.amountPaid) || 0

  // Look up claim by odie_claim_number
  const { data: matchedClaims, error: lookupError } = await supabase
    .from('claims')
    .select('id')
    .eq('odie_claim_number', claimNumber)

  if (lookupError) {
    throw new Error(`Claim lookup failed: ${lookupError.message}`)
  }

  if (!matchedClaims || matchedClaims.length === 0) {
    console.warn(`[Odie Webhook] No claim found with odie_claim_number=${claimNumber}`)
    return
  }

  const claimId = matchedClaims[0].id
  const updates = { odie_claim_status: odieStatus }

  // Map to PCH filing_status if we recognise the Odie status
  const mappedStatus = ODIE_STATUS_TO_FILING[odieStatus]
  if (mappedStatus) {
    updates.filing_status = mappedStatus
  }

  // Set reimbursed_amount if Odie reports payment
  if (amountPaid > 0) {
    updates.odie_amount_paid = amountPaid
    updates.reimbursed_amount = amountPaid
  }

  const { error: updateError } = await supabase
    .from('claims')
    .update(updates)
    .eq('id', claimId)

  if (updateError) {
    throw new Error(`Claim update failed: ${updateError.message}`)
  }

  console.log(
    `[Odie Webhook] Updated claim ${claimId}: odie_status=${odieStatus}` +
    ` → filing_status=${mappedStatus || '(unchanged)'}, amountPaid=${amountPaid}`
  )

  // Send SMS + email notifications (fire-and-forget — failures don't break the webhook)
  try {
    await sendClaimNotifications(supabase, { claimId, claimNumber, odieStatus, amountPaid })
  } catch (notifyErr) {
    console.error(`[Odie Webhook] Notification error for claim ${claimNumber}:`, notifyErr.message)
  }
}

// ---------------------------------------------------------------------------
// POST /webhook
// ---------------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
  const supabase = await getSupabase()
  let logId = null

  try {
    const body = req.body || {}
    const entity = body.entity
    const eventType = body.eventType || body.event_type || null
    const changeId = body.changeId || body.change_id || null
    const claim = body.claim || {}
    const policy = body.policy || {}

    const claimNumber = claim.claimNumber || null
    const policyNumber = policy.policyNumber || claim.policyNumber || null

    console.log(
      `[Odie Webhook] Received: entity=${entity}, event=${eventType},` +
      ` claim=${claimNumber}, policy=${policyNumber}`
    )

    // 1. Log the webhook event
    const { data: logRow, error: logError } = await supabase
      .from('odie_webhook_logs')
      .insert({
        event_type: eventType,
        entity,
        change_id: changeId,
        claim_number: claimNumber,
        policy_number: policyNumber,
        payload: body,
        processed: false,
      })
      .select('id')
      .single()

    if (logError) {
      console.error('[Odie Webhook] Failed to log webhook:', logError.message)
    } else {
      logId = logRow.id
    }

    // 2. Process by entity type
    if (entity === 'CLAIM') {
      await processClaimWebhook(supabase, { claim, claimNumber, logId })
    } else if (entity === 'Policy') {
      console.log(`[Odie Webhook] Policy event for ${policyNumber} — logged, no DB update`)
    } else {
      console.log(`[Odie Webhook] Unknown entity "${entity}" — logged, no DB update`)
    }

    // 3. Mark as processed
    if (logId) {
      await supabase
        .from('odie_webhook_logs')
        .update({ processed: true })
        .eq('id', logId)
    }
  } catch (err) {
    console.error('[Odie Webhook] Processing error:', err.message)

    // Attempt to record the error in the log row
    if (logId) {
      try {
        await supabase
          .from('odie_webhook_logs')
          .update({ error: err.message, processed: false })
          .eq('id', logId)
      } catch (logErr) {
        console.error('[Odie Webhook] Failed to update log with error:', logErr.message)
      }
    }
  }

  // Always return 200 — Odie expects acknowledgment regardless of outcome
  return res.status(200).json({ ok: true })
})

export default router
