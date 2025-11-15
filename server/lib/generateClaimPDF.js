import { jsPDF } from 'jspdf'

/**
 * Generate a claim form PDF for submission to insurance companies
 *
 * @param {string} insurer - 'nationwide', 'healthypaws', or 'trupanion'
 * @param {object} claimData - All claim information
 * @param {string} claimData.policyholderName
 * @param {string} claimData.policyholderAddress
 * @param {string} claimData.policyholderPhone
 * @param {string} claimData.policyholderEmail
 * @param {string} claimData.policyNumber
 * @param {string} claimData.petName
 * @param {string} claimData.petSpecies
 * @param {string} claimData.petBreed
 * @param {number} claimData.petAge
 * @param {string} claimData.treatmentDate
 * @param {string} claimData.vetClinicName
 * @param {string} claimData.vetClinicAddress
 * @param {string} claimData.vetClinicPhone
 * @param {string} claimData.diagnosis
 * @param {number} claimData.totalAmount
 * @param {array} claimData.itemizedCharges - [{description, amount}, ...]
 * @param {string} userSignature - Base64 image or text signature
 * @param {string} dateSigned - ISO date string
 * @returns {Buffer} PDF buffer ready to attach to email
 */
export async function generateClaimFormPDF(insurer, claimData, userSignature, dateSigned) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  // Helper functions
  const addText = (text, x, y, options = {}) => {
    doc.setFontSize(options.fontSize || 10)
    doc.setFont(undefined, options.bold ? 'bold' : 'normal')
    doc.text(text, x, y)
  }

  const addLine = (y) => {
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
  }

  const addField = (label, value, yPosition) => {
    addText(label, margin, yPosition, { fontSize: 9, bold: true })
    addText(String(value || ''), margin + 50, yPosition, { fontSize: 10 })
    return yPosition + 7
  }

  const checkPageBreak = (neededSpace = 20) => {
    if (yPos + neededSpace > pageHeight - margin) {
      doc.addPage()
      yPos = margin
      return true
    }
    return false
  }

  // HEADER
  doc.setFillColor(41, 128, 185) // Blue background
  doc.rect(0, 0, pageWidth, 40, 'F')

  doc.setTextColor(255, 255, 255)
  addText('PET INSURANCE CLAIM FORM', pageWidth / 2, 15, { fontSize: 18, bold: true })
  doc.setFont(undefined, 'normal')
  doc.text(insurer.toUpperCase(), pageWidth / 2, 25, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  yPos = 50

  // SECTION 1: POLICYHOLDER INFORMATION
  addText('SECTION 1: POLICYHOLDER INFORMATION', margin, yPos, { fontSize: 12, bold: true })
  yPos += 10
  addLine(yPos)
  yPos += 8

  yPos = addField('Name:', claimData.policyholderName, yPos)
  yPos = addField('Address:', claimData.policyholderAddress, yPos)
  yPos = addField('Phone:', claimData.policyholderPhone, yPos)
  yPos = addField('Email:', claimData.policyholderEmail, yPos)
  yPos = addField('Policy Number:', claimData.policyNumber, yPos)
  yPos += 5

  checkPageBreak()

  // SECTION 2: PET INFORMATION
  addText('SECTION 2: PET INFORMATION', margin, yPos, { fontSize: 12, bold: true })
  yPos += 10
  addLine(yPos)
  yPos += 8

  yPos = addField('Pet Name:', claimData.petName, yPos)
  yPos = addField('Species:', claimData.petSpecies, yPos)
  yPos = addField('Breed:', claimData.petBreed, yPos)
  yPos = addField('Age:', `${claimData.petAge} years`, yPos)
  yPos += 5

  checkPageBreak()

  // SECTION 3: TREATMENT INFORMATION
  addText('SECTION 3: TREATMENT INFORMATION', margin, yPos, { fontSize: 12, bold: true })
  yPos += 10
  addLine(yPos)
  yPos += 8

  yPos = addField('Treatment Date:', claimData.treatmentDate, yPos)
  yPos = addField('Veterinary Clinic:', claimData.vetClinicName, yPos)
  yPos = addField('Clinic Address:', claimData.vetClinicAddress, yPos)
  yPos = addField('Clinic Phone:', claimData.vetClinicPhone, yPos)
  yPos += 3

  addText('Diagnosis/Reason for Visit:', margin, yPos, { fontSize: 9, bold: true })
  yPos += 6

  // Wrap diagnosis text if too long
  const diagnosisLines = doc.splitTextToSize(claimData.diagnosis, pageWidth - 2 * margin - 10)
  diagnosisLines.forEach(line => {
    checkPageBreak()
    addText(line, margin + 5, yPos, { fontSize: 10 })
    yPos += 5
  })
  yPos += 3

  checkPageBreak()

  // SECTION 4: CLAIM AMOUNT
  addText('SECTION 4: CLAIM AMOUNT', margin, yPos, { fontSize: 12, bold: true })
  yPos += 10
  addLine(yPos)
  yPos += 8

  // Itemized charges table
  addText('Itemized Charges:', margin, yPos, { fontSize: 9, bold: true })
  yPos += 8

  // Table header
  doc.setFillColor(240, 240, 240)
  doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F')
  addText('Description', margin + 2, yPos, { fontSize: 9, bold: true })
  addText('Amount', pageWidth - margin - 30, yPos, { fontSize: 9, bold: true })
  yPos += 8

  // Table rows
  if (claimData.itemizedCharges && claimData.itemizedCharges.length > 0) {
    claimData.itemizedCharges.forEach((item, index) => {
      checkPageBreak()
      const rowY = yPos - 5
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(margin, rowY, pageWidth - 2 * margin, 7, 'F')
      }
      addText(item.description, margin + 2, yPos, { fontSize: 9 })
      addText(`$${parseFloat(item.amount).toFixed(2)}`, pageWidth - margin - 30, yPos, { fontSize: 9 })
      yPos += 7
    })
  }

  yPos += 3
  addLine(yPos)
  yPos += 6

  // Total
  addText('TOTAL AMOUNT CLAIMED:', margin, yPos, { fontSize: 10, bold: true })
  addText(`$${parseFloat(claimData.totalAmount).toFixed(2)}`, pageWidth - margin - 30, yPos, { fontSize: 11, bold: true })
  yPos += 10

  checkPageBreak(40)

  // SECTION 5: AUTHORIZATION
  addText('SECTION 5: AUTHORIZATION & SIGNATURE', margin, yPos, { fontSize: 12, bold: true })
  yPos += 10
  addLine(yPos)
  yPos += 8

  // Authorization statement
  const authText = 'I hereby authorize the release of any medical records or information necessary to process this claim. I certify that the information provided in this claim form is true and accurate to the best of my knowledge. I understand that any false or misleading information may result in claim denial or policy cancellation.'
  const authLines = doc.splitTextToSize(authText, pageWidth - 2 * margin)
  authLines.forEach(line => {
    checkPageBreak()
    addText(line, margin, yPos, { fontSize: 9 })
    yPos += 5
  })
  yPos += 5

  // Fraud warning
  doc.setTextColor(139, 0, 0) // Dark red
  const fraudText = 'FRAUD WARNING: Any person who knowingly and with intent to defraud any insurance company or other person files a claim containing any materially false information or conceals information may be guilty of insurance fraud.'
  const fraudLines = doc.splitTextToSize(fraudText, pageWidth - 2 * margin)
  fraudLines.forEach(line => {
    checkPageBreak()
    addText(line, margin, yPos, { fontSize: 8, bold: true })
    yPos += 4.5
  })
  doc.setTextColor(0, 0, 0)
  yPos += 8

  checkPageBreak(30)

  // Signature section
  addText('Policyholder Signature:', margin, yPos, { fontSize: 10, bold: true })
  yPos += 8

  // Add signature (if base64 image, add it; otherwise add text)
  if (userSignature) {
    if (userSignature.startsWith('data:image')) {
      try {
        doc.addImage(userSignature, 'PNG', margin + 5, yPos - 5, 50, 15)
      } catch (err) {
        console.error('Failed to add signature image:', err)
        addText(userSignature, margin + 5, yPos, { fontSize: 12 })
      }
    } else {
      // Text signature
      doc.setFont(undefined, 'italic')
      addText(userSignature, margin + 5, yPos, { fontSize: 14 })
      doc.setFont(undefined, 'normal')
    }
  }

  yPos += 10
  addLine(yPos)
  yPos += 6

  addText('Date Signed:', margin, yPos, { fontSize: 10, bold: true })
  addText(dateSigned, margin + 30, yPos, { fontSize: 10 })

  // FOOTER
  yPos = pageHeight - 15
  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text('Generated by Pet Claim Helper - https://petclaimhelper.com', pageWidth / 2, yPos, { align: 'center' })
  doc.text(`Claim submitted to ${insurer.toUpperCase()} on ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos + 4, { align: 'center' })

  // Convert to buffer
  const pdfBlob = doc.output('arraybuffer')
  return Buffer.from(pdfBlob)
}

// ================================================================================================
// 🧪 TEST MODE - PREVENT ACCIDENTAL EMAILS TO REAL INSURERS
// ================================================================================================
// Set to false only when ready for production
const TEST_MODE = true
const TEST_EMAIL = 'larry@uglydogadventures.com'
// ================================================================================================

/**
 * Get the email address for submitting claims to each insurer
 *
 * ⚠️ IMPORTANT: When TEST_MODE = true, ALL emails go to TEST_EMAIL instead of real insurers
 */
export function getInsurerClaimEmail(insurer) {
  // TESTING OVERRIDE - send all test emails to Larry
  if (TEST_MODE) {
    console.log(``)
    console.log(`${'='.repeat(80)}`)
    console.log(`🧪 TEST MODE ACTIVE 🧪`)
    console.log(`${'='.repeat(80)}`)
    console.log(`  Insurer: ${insurer}`)
    console.log(`  Would send to: ${getProductionEmail(insurer)}`)
    console.log(`  Redirecting to: ${TEST_EMAIL}`)
    console.log(`${'='.repeat(80)}`)
    console.log(``)
    return TEST_EMAIL
  }

  // Production mode - use real insurer emails
  console.log(`⚠️  PRODUCTION MODE: Sending to real insurer: ${insurer}`)
  return getProductionEmail(insurer)
}

/**
 * Get production email addresses (only used when TEST_MODE = false)
 */
function getProductionEmail(insurer) {
  const emails = {
    'nationwide': 'claims@petinsurance.com',
    'healthy paws': 'claims@healthypawspetinsurance.com',
    'healthypaws': 'claims@healthypawspetinsurance.com',
    'trupanion': 'claims@trupanion.com'
  }
  const normalizedName = insurer.toLowerCase()
  return emails[normalizedName] || null
}

/**
 * Validate claim data before generating PDF
 */
export function validateClaimData(claimData) {
  const required = [
    'policyholderName',
    'policyholderAddress',
    'policyholderPhone',
    'policyholderEmail',
    'policyNumber',
    'petName',
    'petSpecies',
    'treatmentDate',
    'vetClinicName',
    'diagnosis',
    'totalAmount'
  ]

  const missing = required.filter(field => !claimData[field])

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`)
  }

  if (claimData.totalAmount <= 0) {
    throw new Error('Total amount must be greater than 0')
  }

  return true
}
