import { jsPDF } from 'jspdf'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getMappingForInsurer } from './claimFormMappings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ================================================================================================
// 🧪 TEST MODE - PREVENT ACCIDENTAL EMAILS TO REAL INSURERS
// ================================================================================================
// Set to false only when ready for production
const TEST_MODE = true
const TEST_EMAIL = 'larry@uglydogadventures.com'
// ================================================================================================

/**
 * MAIN FUNCTION: Generate claim form PDF using official forms or generated PDF
 *
 * Routes to appropriate method based on insurer:
 * - Nationwide: Official PDF form
 * - Trupanion: Official PDF form
 * - Healthy Paws: Generated PDF (their form has no fillable fields)
 */
export async function generateClaimFormPDF(insurer, claimData, userSignature, dateSigned) {
  const normalizedInsurer = insurer.toLowerCase()

  console.log(`\n${'='.repeat(80)}`)
  console.log(`📄 GENERATING CLAIM PDF`)
  console.log(`${'='.repeat(80)}`)
  console.log(`  Insurer: ${insurer}`)
  console.log(`  Method: ${shouldUseOfficialForm(normalizedInsurer) ? 'Official PDF Form' : 'Generated PDF'}`)
  console.log(`${'='.repeat(80)}\n`)

  // Use official forms for Nationwide and Trupanion
  if (shouldUseOfficialForm(normalizedInsurer)) {
    return await fillOfficialForm(insurer, claimData, userSignature, dateSigned)
  }

  // Use generated PDF for Healthy Paws (and fallback)
  return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
}

/**
 * Check if we should use official form for this insurer
 */
function shouldUseOfficialForm(normalizedInsurer) {
  return normalizedInsurer.includes('nationwide') || normalizedInsurer.includes('trupanion')
}

/**
 * Fill official insurance company PDF form
 */
async function fillOfficialForm(insurer, claimData, userSignature, dateSigned) {
  const normalizedInsurer = insurer.toLowerCase()

  // Determine which PDF to load
  let pdfFilename
  if (normalizedInsurer.includes('nationwide')) {
    pdfFilename = 'nationwide-claim-form.pdf'
  } else if (normalizedInsurer.includes('trupanion')) {
    pdfFilename = 'trupanion-claim-form.pdf'
  } else {
    throw new Error(`No official form available for insurer: ${insurer}`)
  }

  // Load the official PDF
  const pdfPath = path.join(__dirname, '..', 'claim-forms', pdfFilename)
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ Official PDF not found: ${pdfPath}`)
    console.log(`   Falling back to generated PDF`)
    return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
  }

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()

  // Get field mapping for this insurer
  const mapping = getMappingForInsurer(insurer)
  if (!mapping) {
    console.error(`❌ No field mapping found for: ${insurer}`)
    console.log(`   Falling back to generated PDF`)
    return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
  }

  console.log(`✅ Loaded official PDF: ${pdfFilename}`)
  console.log(`📝 Filling fields using mapping...\n`)

  let fieldsFilled = 0
  let fieldsSkipped = 0

  // Fill each mapped field
  for (const [ourFieldName, pdfFieldName] of Object.entries(mapping)) {
    if (!pdfFieldName) continue // Skip null mappings

    // Get the value for this field from our claim data
    const value = getValueForField(ourFieldName, claimData, dateSigned)

    if (!value && value !== false) {
      fieldsSkipped++
      continue // Skip empty values
    }

    try {
      const field = form.getField(pdfFieldName)
      const fieldType = field.constructor.name

      if (fieldType === 'PDFTextField') {
        form.getTextField(pdfFieldName).setText(String(value))
        console.log(`   ✅ ${ourFieldName}: "${value}"`)
        fieldsFilled++
      } else if (fieldType === 'PDFCheckBox') {
        if (value === true) {
          form.getCheckBox(pdfFieldName).check()
          console.log(`   ✅ ${ourFieldName}: CHECKED`)
        } else {
          form.getCheckBox(pdfFieldName).uncheck()
          console.log(`   ✅ ${ourFieldName}: UNCHECKED`)
        }
        fieldsFilled++
      } else if (fieldType === 'PDFRadioGroup') {
        const radioGroup = form.getRadioGroup(pdfFieldName)
        const options = radioGroup.getOptions()
        if (options.length > 0 && value) {
          // Select first option for truthy values
          radioGroup.select(options[0])
          console.log(`   ✅ ${ourFieldName}: Selected "${options[0]}"`)
          fieldsFilled++
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  ${ourFieldName} -> ${pdfFieldName}: ${err.message}`)
    }
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`📊 Form Filling Complete:`)
  console.log(`   Fields filled: ${fieldsFilled}`)
  console.log(`   Fields skipped: ${fieldsSkipped}`)
  console.log('─'.repeat(80) + '\n')

  // Flatten the form (make non-editable)
  form.flatten()

  // Save and return as buffer
  const filledPdfBytes = await pdfDoc.save()
  return Buffer.from(filledPdfBytes)
}

/**
 * Map our claim data fields to PDF form field values
 * Handles data transformation (dates, phone numbers, formatting)
 */
function getValueForField(fieldName, claimData, dateSigned) {
  // Helper to format dates from ISO to MM/DD/YYYY
  const formatDate = (isoDate) => {
    if (!isoDate) return null
    try {
      // Parse date components directly to avoid timezone issues
      // Input format: YYYY-MM-DD
      if (typeof isoDate === 'string' && isoDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [year, month, day] = isoDate.split('T')[0].split('-')
        return `${month}/${day}/${year}`
      }

      // Fallback to Date object parsing
      const date = new Date(isoDate)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const year = date.getFullYear()
      return `${month}/${day}/${year}`
    } catch {
      return isoDate // Return as-is if parsing fails
    }
  }

  // Helper to format phone numbers
  const formatPhone = (phone) => {
    if (!phone) return null
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone // Return as-is if not 10 digits
  }

  // Helper to format amounts
  const formatAmount = (amount) => {
    if (!amount && amount !== 0) return null
    return parseFloat(amount).toFixed(2)
  }

  // Helper to parse address into components
  const parseAddress = (address) => {
    if (!address) return { street: '', city: '', state: '', zip: '' }

    // Try to split address like "123 Main St, San Francisco, CA 94102"
    const parts = address.split(',').map(p => p.trim())

    if (parts.length >= 3) {
      // Last part should be "STATE ZIP"
      const lastPart = parts[parts.length - 1]
      const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(\d{5})/)

      return {
        street: parts[0],
        city: parts[1],
        state: stateZipMatch ? stateZipMatch[1] : '',
        zip: stateZipMatch ? stateZipMatch[2] : ''
      }
    }

    return { street: address, city: '', state: '', zip: '' }
  }

  // Parse addresses
  const policyholderAddr = parseAddress(claimData.policyholderAddress)

  // Field mappings
  const fieldMap = {
    // NATIONWIDE 2025 FORM FIELDS
    policyholderName: claimData.policyholderName,
    policyNumber: claimData.policyNumber,
    petName: claimData.petName,
    diagnosisOther: claimData.diagnosis,  // "Other" text field
    bodyPartAffected: claimData.bodyPartAffected || null,
    medicationRefill: claimData.medicationRefill || null,

    // Itemized charges (3 line items)
    treatmentDate1: claimData.itemizedCharges?.[0] ? formatDate(claimData.treatmentDate) : null,
    totalAmount1: claimData.itemizedCharges?.[0]?.amount ? formatAmount(claimData.itemizedCharges[0].amount) : null,
    treatmentDate2: claimData.itemizedCharges?.[1] ? formatDate(claimData.treatmentDate) : null,
    totalAmount2: claimData.itemizedCharges?.[1]?.amount ? formatAmount(claimData.itemizedCharges[1].amount) : null,
    treatmentDate3: claimData.itemizedCharges?.[2] ? formatDate(claimData.treatmentDate) : null,
    totalAmount3: claimData.itemizedCharges?.[2]?.amount ? formatAmount(claimData.itemizedCharges[2].amount) : null,

    signatureDate: dateSigned,

    // Nationwide checkboxes (auto-detect from diagnosis)
    checkboxEarInfection: claimData.diagnosis?.toLowerCase().includes('ear') || false,
    checkboxSkinInfection: claimData.diagnosis?.toLowerCase().includes('skin') || false,
    checkboxDental: claimData.diagnosis?.toLowerCase().includes('dental') || false,
    checkboxVomiting: claimData.diagnosis?.toLowerCase().includes('vomit') || false,
    checkboxDiarrhea: claimData.diagnosis?.toLowerCase().includes('diarrhea') || false,
    checkboxOther: true,  // Always check "Other" since we fill the text field

    // TRUPANION 2025 FORM FIELDS
    policyholderPhone: formatPhone(claimData.policyholderPhone),
    petDateOfBirth: claimData.petDateOfBirth ? formatDate(claimData.petDateOfBirth) : null,
    diagnosis: claimData.diagnosis,
    hospitalName: claimData.vetClinicName,
    treatingVeterinarian: claimData.treatingVeterinarian || null,

    // Trupanion radio groups - need to select options
    previousClaimFiled: 'If no date of first signs',  // Select "No" option
    dateOfFirstSigns: formatDate(claimData.treatmentDate),
    paymentMethod: 'I have paid my bill in full',  // Select "paid in full" option
    hasOtherProvider: 'No_2',  // Select "No" option

    // Trupanion vet clinic fields
    vetName1: claimData.vetClinicName,
    vetCity1: policyholderAddr.city,
  }

  return fieldMap[fieldName]
}

/**
 * LEGACY: Generate PDF from scratch using jsPDF
 * Used for Healthy Paws (flattened form) and as fallback
 */
async function generatePDFFromScratch(insurer, claimData, userSignature, dateSigned) {
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
