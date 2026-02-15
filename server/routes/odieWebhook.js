/**
 * Odie Pet Insurance — Webhook Receiver
 *
 * Receives POST callbacks from Odie when claim or policy statuses change.
 * Logs every event to the `odie_webhook_logs` table and updates the matching
 * PCH claim when a CLAIM webhook arrives.
 *
 * Endpoint:
 *   POST /api/odie/webhook
 *
 * No authentication is required — Odie calls this endpoint directly.
 * TODO: Add webhook secret verification once Odie provides a signing secret.
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

// ---------------------------------------------------------------------------
// Supabase client (lazy — ensures env vars are loaded before first use)
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
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
}

// ---------------------------------------------------------------------------
// POST /webhook
// ---------------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
  const supabase = getSupabase()
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
