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

  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Starting function')

  // Query all relevant claims and join pets and profiles
  // Use raw SQL to calculate deadline directly since it's not stored in the table
  const { data, error } = await supabase.rpc('get_claims_with_deadlines', {})

  if (error) {
    // Fallback: query the table directly and calculate in JavaScript
    // eslint-disable-next-line no-console
    console.log('[deadline-notifications] RPC failed, falling back to direct query', error)
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

    data = calculatedData
  }

  const claims = data || []
  const claimsChecked = claims.length
  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Claims fetched:', claimsChecked)

  // Build reminder intents per user (email)
  const remindersByUser = {}
  let remindersQueued = 0

  for (const claim of claims) {
    const userEmail = claim?.profiles?.email
    if (!userEmail) continue

    // Parse the calculated deadline (should come from RPC or be calculated above)
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
  const emailsByUser = remindersByUser
  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Batched emails:', Object.keys(emailsByUser).length)

  // Send batched emails per user and update flags
  let emailsSent = 0
  for (const [email, reminders] of Object.entries(remindersByUser)) {
    if (!reminders.length) continue
    try {
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] Processing user email: ${email}`)
      for (const r of reminders) {
        // eslint-disable-next-line no-console
        console.log(`[DEBUG] Sending reminder to: ${email} for claim: ${r.claimId}`)
      }
      const subject = buildSubject(reminders)
      const html = buildEmailHtml(reminders, dashboardUrl())
      const text = buildEmailText(reminders, dashboardUrl())
      const from = 'Pet Claim Helper <onboarding@resend.dev>'
      const result = await resend.emails.send({ from, to: [email], subject, html, text })
      // eslint-disable-next-line no-console
      console.log(`[deadline-notifications] Sent email to ${email}`, { id: result?.id, items: reminders.length })
      // eslint-disable-next-line no-console
      console.log('[DEBUG] Resend response:', result)
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] Email sent successfully to: ${email}`)
      // eslint-disable-next-line no-console
      console.log('[deadline-notifications] Email sent to:', email, 'Result:', result)
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
      // eslint-disable-next-line no-console
      console.error('[DEBUG] Resend error for', email, e)
      errors.push({ type: 'email', email, error: String(e?.message || e) })
    }
  }

  // eslint-disable-next-line no-console
  console.log('[deadline-notifications] Finished. Emails sent:', emailsSent)
  return { success: true, claimsChecked, remindersQueued, emailsSent, errors }
}

export default { runDeadlineNotifications }