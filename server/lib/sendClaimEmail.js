import { resend, ensureResendConfigured } from './resendClient.js'
import { getInsurerClaimEmail } from './generateClaimPDF.js'

/**
 * Send claim submission email to insurance company
 *
 * @param {string} insurer - 'nationwide', 'healthypaws', or 'trupanion'
 * @param {object} claimData - All claim information
 * @param {Buffer} pdfBuffer - Generated claim form PDF
 * @param {Buffer} invoiceBuffer - Vet invoice PDF buffer (optional)
 * @returns {object} { success: boolean, messageId?: string, error?: string }
 */
export async function sendClaimEmail(insurer, claimData, pdfBuffer, invoiceBuffer = null) {
  try {
    ensureResendConfigured()

    const insurerEmail = getInsurerClaimEmail(insurer)
    if (!insurerEmail) {
      throw new Error(`Unknown insurer: ${insurer}`)
    }

    // Build email subject - use Account Number for Spot, Policy Number for others
    const accountOrPolicy = insurer.toLowerCase() === 'spot'
      ? (claimData.spotAccountNumber || 'N/A')
      : (claimData.policyNumber || 'N/A')
    const subject = `Pet Insurance Claim Submission - ${accountOrPolicy} - ${claimData.petName}`

    // Update claimData to reflect whether invoice is attached
    claimData.invoiceAttached = !!invoiceBuffer

    // Build email body
    const htmlBody = buildClaimEmailHTML(insurer, claimData)
    const textBody = buildClaimEmailText(insurer, claimData)

    // Prepare attachments - claim form is always attached
    const attachments = [
      {
        filename: `claim-form-${accountOrPolicy}.pdf`,
        content: pdfBuffer
      }
    ]

    // Add invoice PDF if provided
    if (invoiceBuffer) {
      attachments.push({
        filename: `veterinary-invoice-${accountOrPolicy}.pdf`,
        content: invoiceBuffer
      })
      console.log('[Email] Attaching invoice PDF to email')
    } else {
      console.log('[Email] No invoice PDF to attach')
    }

    // Send email via Resend
    console.log('[Email] 📤 Sending to:', insurerEmail)
    console.log('[Email] 📧 User email for BCC:', claimData.policyholderEmail)

    // Prepare email params - only add BCC if email is valid
    const emailParams = {
      from: 'Pet Claim Helper <claims@petclaimhelper.com>',
      reply_to: 'support@petclaimhelper.com',
      to: insurerEmail,
      subject: subject,
      html: htmlBody,
      text: textBody,
      attachments: attachments
    }

    // BCC the user who filed the claim so they have a copy
    if (claimData.policyholderEmail) {
      emailParams.bcc = [claimData.policyholderEmail]
      console.log('[Email] ✅ BCC will be sent to:', claimData.policyholderEmail)
    } else {
      console.log('[Email] ⚠️ No policyholder email available for BCC')
    }

    const response = await resend.emails.send(emailParams)

    console.log(`✅ Claim email sent to ${insurer}:`, response.id)
    console.log('[Email] 🔍 Full Resend response:', JSON.stringify(response, null, 2))

    return {
      success: true,
      messageId: response.id
    }

  } catch (error) {
    console.error(`❌ Failed to send claim email to ${insurer}:`, error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Build HTML email body for claim submission
 */
function buildClaimEmailHTML(insurer, claimData) {
  const insurerNames = {
    'nationwide': 'Nationwide Pet Insurance',
    'healthypaws': 'Healthy Paws Pet Insurance',
    'trupanion': 'Trupanion',
    'pumpkin': 'Pumpkin Pet Insurance',
    'spot': 'Spot Pet Insurance'
  }

  const insurerName = insurerNames[insurer.toLowerCase()] || insurer

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      background: #ffffff;
      padding: 30px;
      border: 1px solid #e0e0e0;
      border-top: none;
    }
    .info-section {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .info-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      width: 150px;
      color: #555;
    }
    .info-value {
      flex: 1;
      color: #333;
    }
    .amount {
      font-size: 20px;
      font-weight: bold;
      color: #2563eb;
      text-align: center;
      padding: 15px;
      background: #eff6ff;
      border-radius: 6px;
      margin: 20px 0;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 0 0 8px 8px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .attachments {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
    }
    .attachments-title {
      font-weight: 600;
      color: #856404;
      margin-bottom: 10px;
    }
    .attachment-item {
      color: #856404;
      padding: 5px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐾 Pet Insurance Claim Submission</h1>
  </div>

  <div class="content">
    <p>Dear ${insurerName} Claims Department,</p>

    <p>Please find attached a pet insurance claim submission for the following policy:</p>

    <div class="info-section">
      <div class="info-row">
        <span class="info-label">${insurer.toLowerCase() === 'spot' ? 'Account Number:' : 'Policy Number:'}</span>
        <span class="info-value">${insurer.toLowerCase() === 'spot' ? (claimData.spotAccountNumber || 'N/A') : (claimData.policyNumber || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Policyholder:</span>
        <span class="info-value">${claimData.policyholderName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Pet Name:</span>
        <span class="info-value">${claimData.petName} (${claimData.petSpecies})</span>
      </div>
      <div class="info-row">
        <span class="info-label">Treatment Date:</span>
        <span class="info-value">${formatDate(claimData.treatmentDate)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Veterinary Clinic:</span>
        <span class="info-value">${claimData.vetClinicName}</span>
      </div>
    </div>

    <div class="amount">
      Total Claim Amount: $${parseFloat(claimData.totalAmount).toFixed(2)}
    </div>

    <div class="attachments">
      <div class="attachments-title">📎 Attachments</div>
      <div class="attachment-item">✓ Completed Claim Form (PDF)</div>
      ${claimData.invoiceAttached ? '<div class="attachment-item">✓ Veterinary Invoice (PDF)</div>' : ''}
    </div>

    <p><strong>Diagnosis:</strong><br>${claimData.diagnosis}</p>

    <p>The attached claim form has been completed with all required information including:</p>
    <ul>
      <li>Policyholder and pet information</li>
      <li>Treatment details and diagnosis</li>
      <li>Itemized charges</li>
      <li>Veterinary clinic information</li>
      <li>Policyholder authorization and signature</li>
    </ul>

    <p>Please process this claim at your earliest convenience. If you require any additional information or documentation, please contact the policyholder directly at:</p>

    <div class="info-section">
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${claimData.policyholderEmail}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone:</span>
        <span class="info-value">${claimData.policyholderPhone}</span>
      </div>
    </div>

    <p>Thank you for your prompt attention to this claim.</p>

    <p>Sincerely,<br>
    <strong>${claimData.policyholderName}</strong><br>
    <em>via Pet Claim Helper</em></p>
  </div>

  <div class="footer">
    <p>This claim was submitted automatically using Pet Claim Helper</p>
    <p><a href="https://petclaimhelper.com">petclaimhelper.com</a></p>
    <p style="color: #999; font-size: 11px; margin-top: 10px;">
      Submitted on ${new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Build plain text email body for claim submission (fallback)
 */
function buildClaimEmailText(insurer, claimData) {
  const insurerNames = {
    'nationwide': 'Nationwide Pet Insurance',
    'healthypaws': 'Healthy Paws Pet Insurance',
    'trupanion': 'Trupanion',
    'pumpkin': 'Pumpkin Pet Insurance',
    'spot': 'Spot Pet Insurance'
  }

  const insurerName = insurerNames[insurer.toLowerCase()] || insurer

  return `
PET INSURANCE CLAIM SUBMISSION

Dear ${insurerName} Claims Department,

Please find attached a pet insurance claim submission for the following policy:

CLAIM DETAILS:
- ${insurer.toLowerCase() === 'spot' ? 'Account Number' : 'Policy Number'}: ${insurer.toLowerCase() === 'spot' ? (claimData.spotAccountNumber || 'N/A') : (claimData.policyNumber || 'N/A')}
- Policyholder: ${claimData.policyholderName}
- Pet Name: ${claimData.petName} (${claimData.petSpecies})
- Treatment Date: ${formatDate(claimData.treatmentDate)}
- Veterinary Clinic: ${claimData.vetClinicName}
- Total Claim Amount: $${parseFloat(claimData.totalAmount).toFixed(2)}

DIAGNOSIS:
${claimData.diagnosis}

ATTACHMENTS:
✓ Completed Claim Form (PDF)
${claimData.invoiceAttached ? '✓ Veterinary Invoice (PDF)' : ''}

The attached claim form has been completed with all required information including policyholder and pet information, treatment details, itemized charges, veterinary clinic information, and policyholder authorization.

Please process this claim at your earliest convenience. If you require any additional information, please contact:

Email: ${claimData.policyholderEmail}
Phone: ${claimData.policyholderPhone}

Thank you for your prompt attention to this claim.

Sincerely,
${claimData.policyholderName}
(via Pet Claim Helper - https://petclaimhelper.com)

Submitted on ${new Date().toLocaleString('en-US')}
  `.trim()
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
