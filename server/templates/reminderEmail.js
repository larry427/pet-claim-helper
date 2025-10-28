export function buildReminderSubject({ petName, daysRemaining }) {
  return `⏰ Your ${petName || 'pet'} claim expires in ${daysRemaining} days`
}

export function buildReminderText({ petName, serviceDate, amount, deadline, daysRemaining, claimUrl }) {
  return [
    `Heads up! ${petName || 'Your pet'}'s claim is due soon.`,
    `Service Date: ${serviceDate || '—'}`,
    `Amount: $${Number(amount || 0).toFixed(2)}`,
    `Deadline: ${deadline || '—'} (${daysRemaining} days)`,
    '',
    `View claim: ${claimUrl}`,
  ].join('\n')
}

export function buildReminderHtml({ petName, serviceDate, amount, deadline, daysRemaining, claimUrl }) {
  const fmtAmount = `$${Number(amount || 0).toFixed(2)}`
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Claim Reminder</title>
    <style>
      body { background: #f8fafc; color: #0f172a; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      .container { max-width: 520px; margin: 0 auto; padding: 24px; }
      .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
      .muted { color: #64748b; font-size: 14px; }
      .row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px; }
      .cta { display: inline-block; margin-top: 16px; background: #059669; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-weight: 600; }
      .footer { margin-top: 16px; color: #64748b; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="title">⏰ ${petName || 'Your pet'} claim expires in ${daysRemaining} days</div>
        <div class="muted">Don’t risk missing your filing deadline.</div>
        <div class="row"><div>Service Date</div><div><strong>${serviceDate || '—'}</strong></div></div>
        <div class="row"><div>Amount</div><div><strong>${fmtAmount}</strong></div></div>
        <div class="row"><div>File By</div><div><strong>${deadline || '—'}</strong></div></div>
        <a class="cta" href="${claimUrl}" target="_blank" rel="noopener noreferrer">View claim</a>
        <div class="footer">This is a reminder from Pet Claim Helper. Update notification settings in your profile.</div>
      </div>
    </div>
  </body>
</html>`
}


