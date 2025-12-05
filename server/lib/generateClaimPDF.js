import { jsPDF } from 'jspdf'
import { PDFDocument, PDFName } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getMappingForInsurer,
  TRUPANION_RADIO_OPTIONS,
  NATIONWIDE_RADIO_OPTIONS,
  formatDateForPDF,
  formatCurrencyForPDF,
  formatPhoneForPDF
} from './claimFormMappings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ================================================================================================
// 🧪 TEST MODE - PREVENT ACCIDENTAL EMAILS TO REAL INSURERS
// ================================================================================================
// Set to false only when ready for production
const TEST_MODE = true
const TEST_EMAIL = 'larry@vrexistence.com'
// ================================================================================================

/**
 * MAIN FUNCTION: Generate claim form PDF using official forms or generated PDF
 *
 * Routes to appropriate method based on insurer:
 * - Nationwide: Official PDF form (fillable fields)
 * - Trupanion: Official PDF form (fillable fields)
 * - Healthy Paws: Official PDF form (text overlay - no fillable fields)
 */
export async function generateClaimFormPDF(insurer, claimData, userSignature, dateSigned) {
  const normalizedInsurer = insurer.toLowerCase()

  console.log(`\n${'='.repeat(80)}`)
  console.log(`📄 GENERATING CLAIM PDF`)
  console.log(`${'='.repeat(80)}`)
  console.log(`  Insurer: ${insurer}`)
  console.log(`  Method: ${shouldUseOfficialForm(normalizedInsurer) ? 'Official PDF Form' : 'Generated PDF'}`)
  console.log(`  🔍 DEBUG claimData.claimType: "${claimData.claimType}"`)
  console.log(`  🔍 DEBUG claimData keys: ${Object.keys(claimData).join(', ')}`)
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
  return normalizedInsurer.includes('nationwide') ||
         normalizedInsurer.includes('trupanion') ||
         normalizedInsurer.includes('healthy') ||
         normalizedInsurer.includes('paws') ||
         normalizedInsurer.includes('pumpkin')
}

/**
 * Fill official insurance company PDF form
 */
async function fillOfficialForm(insurer, claimData, userSignature, dateSigned) {
  const normalizedInsurer = insurer.toLowerCase()

  console.log('🔍 DEBUG fillOfficialForm:')
  console.log(`   Raw insurer: "${insurer}"`)
  console.log(`   Normalized: "${normalizedInsurer}"`)
  console.log(`   includes('healthy'): ${normalizedInsurer.includes('healthy')}`)
  console.log(`   includes('paws'): ${normalizedInsurer.includes('paws')}`)

  // Determine which PDF to load
  let pdfFilename
  if (normalizedInsurer.includes('nationwide')) {
    pdfFilename = 'nationwide-claim-form.pdf'
    console.log(`   ✅ Matched: Nationwide`)
  } else if (normalizedInsurer.includes('trupanion')) {
    pdfFilename = 'trupanion-claim-form.pdf'
    console.log(`   ✅ Matched: Trupanion`)
  } else if (normalizedInsurer.includes('healthy') || normalizedInsurer.includes('paws')) {
    pdfFilename = 'Healthy Paws blank form.pdf'
    console.log(`   ✅ Matched: Healthy Paws`)
  } else if (normalizedInsurer.includes('pumpkin')) {
    pdfFilename = 'pumpkin-claim-form.pdf'
    console.log(`   ✅ Matched: Pumpkin`)
  } else {
    console.log(`   ❌ NO MATCH for insurer: "${insurer}"`)
    throw new Error(`No official form available for insurer: ${insurer}`)
  }

  console.log(`   Selected PDF: "${pdfFilename}"`)

  // Load the official PDF
  const pdfPath = path.join(__dirname, '..', 'claim-forms', pdfFilename)
  console.log(`   Full path: "${pdfPath}"`)
  console.log(`   __dirname: "${__dirname}"`)

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ Official PDF not found: ${pdfPath}`)
    console.log(`   Listing claim-forms directory:`)
    try {
      const dirPath = path.join(__dirname, '..', 'claim-forms')
      const files = fs.readdirSync(dirPath)
      console.log(`   Files in ${dirPath}:`)
      files.forEach(file => console.log(`     - ${file}`))
    } catch (e) {
      console.error(`   Could not list directory: ${e.message}`)
    }
    console.log(`   Falling back to generated PDF`)
    return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
  }

  console.log(`   ✅ PDF file exists`)


  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // Check if this is a flat PDF (no form fields) - use text overlay instead
  const form = pdfDoc.getForm()
  const fields = form.getFields()

  if (fields.length === 0) {
    console.log(`📄 Flat PDF detected (no form fields)`)
    console.log(`   Using text overlay method for ${insurer}\n`)
    return await fillFlatPDFWithTextOverlay(pdfDoc, insurer, claimData, userSignature, dateSigned)
  }

  // Remove unwanted pages from Nationwide form (keep only page 1)
  if (normalizedInsurer.includes('nationwide')) {
    const pageCount = pdfDoc.getPageCount()
    console.log(`📄 Nationwide PDF has ${pageCount} pages`)

    // Remove all pages except the first one
    if (pageCount > 1) {
      console.log(`🗑️  Removing pages 2-${pageCount} (legal disclaimers/boilerplate)...`)
      // Remove pages from the end to avoid index shifting
      for (let i = pageCount - 1; i >= 1; i--) {
        pdfDoc.removePage(i)
      }
      console.log(`✅ Kept only page 1 (claim form)\n`)
    }
  }

  // Get field mapping for this insurer
  const mapping = getMappingForInsurer(insurer)
  if (!mapping) {
    console.error(`❌ No field mapping found for: ${insurer}`)
    console.log(`   Falling back to generated PDF`)
    return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
  }

  console.log(`✅ Loaded official PDF: ${pdfFilename}`)
  console.log(`📝 Filling fields using mapping...\n`)

  // CRITICAL: Clear ALL text field placeholders before filling
  // Trupanion forms have GRAY PLACEHOLDERS in the appearance stream (AP)
  // These are NOT text values - they're visual appearances!
  console.log('🧹 Clearing all placeholder APPEARANCES from form fields...')
  console.log('   Removing appearance streams (AP) where gray placeholders live\n')
  const allFields = form.getFields()
  let placeholdersCleared = 0
  for (const field of allFields) {
    if (field.constructor.name === 'PDFTextField') {
      try {
        // CRITICAL: Delete the appearance stream (where gray placeholders are stored)
        field.acroField.dict.delete(PDFName.of('AP'))

        // Clear the text value
        field.setText('')

        placeholdersCleared++
      } catch (e) {
        // Some fields may not have an AP entry or may be read-only
      }
    }
  }
  console.log(`   ✅ Cleared ${placeholdersCleared} text field appearances\n`)

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
        const textField = form.getTextField(pdfFieldName)

        // CRITICAL: Delete appearance stream to remove gray placeholders
        // Don't call updateAppearances() yet - will do it once at the end
        try {
          textField.acroField.dict.delete(PDFName.of('AP'))
        } catch (e) {
          // Field may not have an AP entry
        }

        // Set the actual value
        textField.setText('')
        textField.setText(String(value))

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
        console.log(`   📻 Radio group "${ourFieldName}" options:`, options)

        if (value && typeof value === 'string') {
          // Try to select the exact option value
          if (options.includes(value)) {
            radioGroup.select(value)
            console.log(`   ✅ ${ourFieldName}: Selected "${value}"`)
            fieldsFilled++
          } else {
            console.warn(`   ⚠️  ${ourFieldName}: Option "${value}" not found in [${options.join(', ')}]`)
          }
        } else if (options.length > 0 && value) {
          // Fallback: Select first option for truthy values
          radioGroup.select(options[0])
          console.log(`   ✅ ${ourFieldName}: Selected "${options[0]}" (default)`)
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

  // CRITICAL: Update all field appearances after filling to ensure placeholders are gone
  console.log('🔄 Updating all field appearances to finalize placeholder removal...')
  try {
    form.updateFieldAppearances()
    console.log('   ✅ Field appearances updated\n')
  } catch (e) {
    console.log('   ⚠️  Could not update field appearances:', e.message, '\n')
  }

  // Embed signature image if provided (Trupanion doesn't need signatures)
  if (normalizedInsurer.includes('trupanion')) {
    console.log('ℹ️  Trupanion forms do not require signatures - skipping signature embedding')
  } else if (userSignature && typeof userSignature === 'string' && userSignature.startsWith('data:image')) {
    try {
      console.log('🖊️  Embedding signature image...')
      console.log('   Signature data (first 50 chars):', userSignature.substring(0, 50))

      // Extract base64 data from data URL (data:image/png;base64,...)
      const base64Data = userSignature.split(',')[1]
      const signatureBytes = Buffer.from(base64Data, 'base64')

      console.log('   Signature bytes length:', signatureBytes.length)

      // Embed the PNG image
      const signatureImage = await pdfDoc.embedPng(signatureBytes)

      // Get the first page (signature is on page 1 for Nationwide)
      const pages = pdfDoc.getPages()
      const firstPage = pages[0]
      const { width: pageWidth, height: pageHeight } = firstPage.getSize()

      console.log(`   Page dimensions: ${pageWidth} x ${pageHeight}`)

      // Nationwide form signature positioning
      // Position in the "Pet parent signature ___" field near bottom of page 1
      // Based on PDF inspection: Date field is at y=201.886
      // Signature line appears to be around y=200-210
      const signatureWidth = 200
      const signatureHeight = 35
      const signatureX = 150  // Left-aligned in signature area
      const signatureY = 205  // Aligned with Date field (y=201.886)
      console.log('   Using Nationwide signature position')

      console.log(`   Attempting to draw signature at (${signatureX}, ${signatureY})`)
      console.log(`   Signature size: ${signatureWidth} x ${signatureHeight}`)

      firstPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureWidth,
        height: signatureHeight
      })

      console.log(`   ✅ Signature embedded successfully at (${signatureX}, ${signatureY})`)
      fieldsFilled++

    } catch (signatureError) {
      console.error(`   ❌ Failed to embed signature: ${signatureError.message}`)
      console.error('   Full error:', signatureError)
    }
  } else {
    console.log('ℹ️  No signature provided or invalid format')
    console.log('   userSignature type:', typeof userSignature)
    console.log('   userSignature value (first 100 chars):', userSignature?.substring(0, 100))
  }

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

  // Helper to format dates for Healthy Paws (spaces instead of slashes)
  // HP forms have pre-printed slashes, so we just need the numbers separated by spaces
  const formatDateHealthyPaws = (isoDate) => {
    if (!isoDate) return null
    try {
      // Parse date components directly to avoid timezone issues
      // Input format: YYYY-MM-DD
      if (typeof isoDate === 'string' && isoDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [year, month, day] = isoDate.split('T')[0].split('-')
        return `${month}  ${day}  ${year}` // Double spaces for better spacing
      }

      // Fallback to Date object parsing
      const date = new Date(isoDate)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const year = date.getFullYear()
      return `${month}  ${day}  ${year}` // Double spaces for better spacing
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

  // Helper to parse hospital name from otherHospitalsVisited field
  // Format: "Hospital Name - City\nAnother Hospital - Another City"
  // Index: 0 for first hospital, 1 for second hospital
  const parseHospitalName = (hospitalsText, index) => {
    if (!hospitalsText) return null
    const lines = hospitalsText.split('\n').filter(line => line.trim())
    if (index >= lines.length) return null
    const parts = lines[index].split('-').map(p => p.trim())
    return parts[0] || null
  }

  // Helper to parse hospital city from otherHospitalsVisited field
  const parseHospitalCity = (hospitalsText, index) => {
    if (!hospitalsText) return null
    const lines = hospitalsText.split('\n').filter(line => line.trim())
    if (index >= lines.length) return null
    const parts = lines[index].split('-').map(p => p.trim())
    return parts[1] || null
  }

  // Parse addresses
  const policyholderAddr = parseAddress(claimData.policyholderAddress)

  console.log('\n' + '='.repeat(80))
  console.log('🔍 DEBUG: getValueForField - claimData received:')
  console.log('='.repeat(80))
  console.log('policyNumber:', claimData.policyNumber)
  console.log('bodyPartAffected:', claimData.bodyPartAffected)
  console.log('diagnosis:', claimData.diagnosis)
  console.log('🔍 TRUPANION DATE FIELDS:')
  console.log('petDateOfBirth:', claimData.petDateOfBirth, '(type:', typeof claimData.petDateOfBirth + ')')
  console.log('petAdoptionDate:', claimData.petAdoptionDate, '(type:', typeof claimData.petAdoptionDate + ')')
  console.log('petSpayNeuterDate:', claimData.petSpayNeuterDate, '(type:', typeof claimData.petSpayNeuterDate + ')')
  console.log('='.repeat(80) + '\n')

  // DEBUG: Log HP Pet ID to verify it's being received
  if (claimData.healthyPawsPetId) {
    console.log('[PDF Generation] healthyPawsPetId received:', claimData.healthyPawsPetId)
  } else {
    console.log('[PDF Generation] healthyPawsPetId is MISSING or BLANK')
  }

  // Field mappings
  const fieldMap = {
    // HEALTHY PAWS COORDINATE-BASED FIELDS
    healthyPawsPetId: claimData.healthyPawsPetId,
    policyholderEmail: claimData.policyholderEmail,
    veterinaryClinic: claimData.vetClinicName,
    invoiceNumber: claimData.invoiceNumber,
    // dateFirstSymptoms - REMOVED - Legal liability risk, let policyholder fill manually
    policyholderPhone: formatPhone(claimData.policyholderPhone),
    treatmentDate: claimData.treatmentDate ? formatDate(claimData.treatmentDate) : null,
    totalAmount: claimData.totalAmount ? '$' + formatAmount(claimData.totalAmount) : null,
    signatureDate: dateSigned,  // Standard MM/DD/YYYY format (form has no pre-printed slashes)
    diagnosis: claimData.diagnosis,

    // NATIONWIDE 2025 FORM FIELDS
    policyholderName: claimData.policyholderName,
    policyNumber: claimData.policyNumber,
    petName: claimData.petName,
    diagnosisOther: claimData.diagnosis,  // "Other" text field
    bodyPartAffected: claimData.bodyPartAffected || null,
    medicationRefill: claimData.medicationRefill || null,

    // Itemized charges (3 line items)
    // Nationwide form expects: Date + Total per invoice
    // Current implementation: We only have ONE invoice with multiple line items
    // Solution: Show the treatment date ONCE with the total invoice amount
    treatmentDate1: claimData.treatmentDate ? formatDate(claimData.treatmentDate) : null,
    totalAmount1: claimData.totalAmount ? formatAmount(claimData.totalAmount) : null,
    treatmentDate2: null,  // Reserved for additional invoices from different visit dates
    totalAmount2: null,
    treatmentDate3: null,  // Reserved for additional invoices from different visit dates
    totalAmount3: null,

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
    treatingVeterinarian: claimData.vetClinicName,  // Use clinic name as treating veterinarian
    // REMOVED: dateOfFirstSigns - LEGAL LIABILITY RISK
    // Never auto-fill "date of first signs" - this creates legal liability for policyholders
    // If insurance company wants this info, they will ask the policyholder directly
    dateOfAdoption: claimData.petAdoptionDate ? formatDate(claimData.petAdoptionDate) : null,
    spayNeuterDate: claimData.petSpayNeuterDate ? formatDate(claimData.petSpayNeuterDate) : null,
    // spayNeuter radio: Use EXPLICIT radio option constants
    spayNeuter: claimData.petSpayNeuterStatus === 'Yes'
      ? (claimData.petSpayNeuterDate ? TRUPANION_RADIO_OPTIONS.spayNeuter.yes : TRUPANION_RADIO_OPTIONS.spayNeuter.yesNoDate)
      : TRUPANION_RADIO_OPTIONS.spayNeuter.no,

    // Trupanion: Other insurance provider fields - Use EXPLICIT radio option constants
    hasOtherProvider: (claimData.hadOtherInsurance === 'Yes' || claimData.hadOtherInsurance === true)
      ? TRUPANION_RADIO_OPTIONS.hasOtherProvider.yes
      : TRUPANION_RADIO_OPTIONS.hasOtherProvider.no,
    otherProviderName: claimData.otherInsuranceProvider || null,
    cancelDate: claimData.otherInsuranceCancelDate ? formatDate(claimData.otherInsuranceCancelDate) : null,
    policyStillActive: claimData.otherInsuranceCancelDate ? false : true,  // Checkbox - true if no cancel date

    // Trupanion: Hospital history (veterinary clinic details)
    // Parse otherHospitalsVisited into Name/City pairs
    // Format: "Hospital Name - City\nAnother Hospital - Another City"
    vetName1: claimData.otherHospitalsVisited ? parseHospitalName(claimData.otherHospitalsVisited, 0) : null,
    vetCity1: claimData.otherHospitalsVisited ? parseHospitalCity(claimData.otherHospitalsVisited, 0) : null,
    vetName2: claimData.otherHospitalsVisited ? parseHospitalName(claimData.otherHospitalsVisited, 1) : null,
    vetCity2: claimData.otherHospitalsVisited ? parseHospitalCity(claimData.otherHospitalsVisited, 1) : null,

    // Trupanion: Claim history - Use EXPLICIT radio option constants
    previousClaimFiled: claimData.previousClaimSameCondition === 'Yes'
      ? TRUPANION_RADIO_OPTIONS.previousClaim.yesHasClaimNumber
      : TRUPANION_RADIO_OPTIONS.previousClaim.noHasDateOfFirstSigns,
    previousClaimNumber: claimData.previousClaimNumber || null,

    // Payment method - INTENTIONALLY OMITTED
    // Trupanion form states: "Leaving this section unmarked will result in payment to you, the policyholder"
    // This is the desired default behavior, so we do NOT include this field in the mapping
    // The field will remain blank on the PDF, which is correct per Trupanion's instructions,

    // PUMPKIN 2024 FORM FIELDS
    pumpkinAccountNumber: claimData.pumpkinAccountNumber,
    breed: claimData.breed,
    claimType: claimData.claimType,  // Accident, Illness, or Preventive
    address: policyholderAddr.street,  // Street address only
    apartment: null,  // Not collected separately
    city: claimData.city || policyholderAddr.city,
    state: claimData.state || policyholderAddr.state,
    zip: claimData.zip || policyholderAddr.zip,
    dateIllnessOccurred: claimData.treatmentDate ? formatDate(claimData.treatmentDate) : null
  }

  return fieldMap[fieldName]
}

/**
 * Fill flat PDF (no form fields) using text overlay at coordinates
 * Used for Healthy Paws and other insurers with non-fillable forms
 */
async function fillFlatPDFWithTextOverlay(pdfDoc, insurer, claimData, userSignature, dateSigned) {
  const normalizedInsurer = insurer.toLowerCase()

  console.log(`\n${'='.repeat(80)}`)
  console.log(`📝 FILLING FLAT PDF WITH TEXT OVERLAY`)
  console.log(`${'='.repeat(80)}`)
  console.log(`  Insurer: ${insurer}`)
  console.log(`  Method: Coordinate-based text overlay`)
  console.log(`${'='.repeat(80)}\n`)

  // PUMPKIN DEBUG: Log entire claimData object
  if (normalizedInsurer.includes('pumpkin')) {
    console.log(`\n${'🔍'.repeat(40)}`)
    console.log('🔍 PUMPKIN PDF GENERATION - FULL CLAIMDATA OBJECT:')
    console.log(`${'🔍'.repeat(40)}`)
    console.log(JSON.stringify(claimData, null, 2))
    console.log(`${'🔍'.repeat(40)}\n`)
  }

  // Get coordinate mapping for this insurer
  const mapping = getMappingForInsurer(insurer)
  if (!mapping) {
    console.error(`❌ No coordinate mapping found for: ${insurer}`)
    console.log(`   Falling back to generated PDF`)
    return await generatePDFFromScratch(insurer, claimData, userSignature, dateSigned)
  }

  // Get all pages
  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const secondPage = pages.length > 1 ? pages[1] : null
  const { width, height } = firstPage.getSize()

  console.log(`📄 Total pages: ${pages.length}`)
  console.log(`📄 Page 1 dimensions: ${width} x ${height} points\n`)

  // Embed fonts
  const { StandardFonts } = await import('pdf-lib')
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  console.log(`✅ Fonts embedded\n`)
  console.log(`📝 Overlaying text fields...\n`)

  let fieldsFilled = 0
  let fieldsSkipped = 0

  // PUMPKIN SPECIAL HANDLING: Calculate age from date of birth
  let calculatedAge = null
  if (normalizedInsurer.includes('pumpkin') && claimData.petDateOfBirth) {
    try {
      const birthDate = new Date(claimData.petDateOfBirth)
      const today = new Date()
      const ageInYears = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000))
      calculatedAge = ageInYears + (ageInYears === 1 ? ' year' : ' years')
      console.log(`🐾 Calculated pet age from DOB (${claimData.petDateOfBirth}): ${calculatedAge}`)
    } catch (e) {
      console.warn(`⚠️  Could not calculate age from DOB: ${e.message}`)
    }
  }

  // Fill each mapped field using coordinates
  for (const [ourFieldName, coordinates] of Object.entries(mapping)) {
    if (!coordinates) {
      fieldsSkipped++
      continue
    }

    // PUMPKIN SPECIAL HANDLING: claimType checkboxes - draw "X" at correct position
    if (normalizedInsurer.includes('pumpkin') && ourFieldName.startsWith('claimType')) {
      const expectedType = ourFieldName.replace('claimType', '')  // "Accident", "Illness", or "Preventive"
      console.log(`   🔍 DEBUG Checkbox field: ${ourFieldName}, expectedType: "${expectedType}", claimData.claimType: "${claimData.claimType}"`)

      if (claimData.claimType === expectedType) {
        try {
          const targetPage = coordinates.page === 2 && secondPage ? secondPage : firstPage
          targetPage.drawText('X', {
            x: coordinates.x,
            y: coordinates.y,
            size: coordinates.size || 12,
            font: helveticaBoldFont,
            color: { type: 'RGB', red: 0, green: 0, blue: 0 }
          })
          console.log(`   ✅ claimType: "X" at ${expectedType} checkbox (${coordinates.x}, ${coordinates.y})`)
          fieldsFilled++
        } catch (err) {
          console.warn(`   ⚠️  ${ourFieldName}: ${err.message}`)
        }
      } else {
        console.log(`   ⏭️  Skipping ${ourFieldName} - not selected (wanted: ${expectedType}, got: ${claimData.claimType})`)
      }
      continue
    }

    // PUMPKIN SPECIAL HANDLING: isEstimateNo checkbox - always mark "No"
    if (normalizedInsurer.includes('pumpkin') && ourFieldName === 'isEstimateNo') {
      try {
        const targetPage = coordinates.page === 2 && secondPage ? secondPage : firstPage
        targetPage.drawText('X', {
          x: coordinates.x,
          y: coordinates.y,
          size: coordinates.size || 12,
          font: helveticaBoldFont,
          color: { type: 'RGB', red: 0, green: 0, blue: 0 }
        })
        console.log(`   ✅ isEstimateNo: "X" at "No" checkbox (${coordinates.x}, ${coordinates.y})`)
        fieldsFilled++
      } catch (err) {
        console.warn(`   ⚠️  ${ourFieldName}: ${err.message}`)
      }
      continue
    }

    // Handle signature image separately (doesn't use getValueForField)
    if (ourFieldName === 'signature' && coordinates.width && coordinates.height) {
      console.log(`🖊️  Processing signature field...`)
      console.log(`   Has userSignature: ${!!userSignature}`)
      console.log(`   Signature type: ${typeof userSignature}`)
      console.log(`   Signature preview: ${userSignature?.substring(0, 30)}...`)

      if (userSignature && typeof userSignature === 'string' && userSignature.startsWith('data:image')) {
        try {
          console.log(`   ✅ Valid signature data URL detected`)
          console.log(`   Embedding signature at (${coordinates.x}, ${coordinates.y}) with size ${coordinates.width}x${coordinates.height}`)

          // Extract base64 data from data URL
          const base64Data = userSignature.split(',')[1]
          const signatureBytes = Buffer.from(base64Data, 'base64')
          console.log(`   Signature bytes length: ${signatureBytes.length}`)

          // Embed the PNG image
          const signatureImage = await pdfDoc.embedPng(signatureBytes)

          // Use correct page for signature
          const targetPage = coordinates.page === 2 && secondPage ? secondPage : firstPage
          targetPage.drawImage(signatureImage, {
            x: coordinates.x,
            y: coordinates.y,
            width: coordinates.width,
            height: coordinates.height
          })

          console.log(`   ✅ Signature embedded successfully on page ${coordinates.page || 1}!`)
          fieldsFilled++
        } catch (sigError) {
          console.error(`   ❌ Failed to embed signature: ${sigError.message}`)
          fieldsSkipped++
        }
      } else {
        console.log(`   ⚠️  No valid signature provided`)
        console.log(`   Expected format: data:image/png;base64,...`)
        fieldsSkipped++
      }
      continue
    }

    // PUMPKIN SPECIAL HANDLING: Use calculated age instead of fetching from claimData
    let value
    if (normalizedInsurer.includes('pumpkin') && ourFieldName === 'age' && calculatedAge) {
      value = calculatedAge
    } else {
      // PUMPKIN DEBUG: Log before getting value
      if (normalizedInsurer.includes('pumpkin')) {
        console.log(`\n📝 Processing field: "${ourFieldName}"`)
        console.log(`   Checking claimData["${ourFieldName}"] = ${claimData[ourFieldName]}`)
      }

      // Get the value for this field from our claim data
      value = getValueForField(ourFieldName, claimData, dateSigned)

      // PUMPKIN DEBUG: Log after getting value
      if (normalizedInsurer.includes('pumpkin')) {
        console.log(`   getValueForField("${ourFieldName}") returned: ${value}`)
      }
    }

    if (!value && value !== false) {
      if (normalizedInsurer.includes('pumpkin')) {
        console.log(`   ⚠️  SKIPPED (no value)\n`)
      }
      fieldsSkipped++
      continue
    }

    try {
      // PUMPKIN SPECIAL HANDLING: Auto-generate diagnosis from line items
      if (normalizedInsurer.includes('pumpkin') && ourFieldName === 'diagnosis') {
        // Check if we have line items to generate from
        if (claimData.itemizedCharges && Array.isArray(claimData.itemizedCharges) && claimData.itemizedCharges.length > 0) {
          // Extract descriptions from line items and join them
          const descriptions = claimData.itemizedCharges
            .map(item => item.description)
            .filter(desc => desc && desc.trim())
            .slice(0, 3)  // Limit to first 3 items to keep it concise

          if (descriptions.length > 0) {
            value = descriptions.join(', ')
            console.log(`   🔍 Auto-generated diagnosis from ${descriptions.length} line items: "${value}"`)
          } else {
            value = 'Please see attached invoice'
            console.log(`   ⚠️  No valid line item descriptions found, using fallback`)
          }
        } else {
          value = 'Please see attached invoice'
          console.log(`   ⚠️  No line items available, using fallback`)
        }
      }

      // PUMPKIN SPECIAL HANDLING: Prepend "$" to totalAmount (if not already present)
      if (normalizedInsurer.includes('pumpkin') && ourFieldName === 'totalAmount') {
        const stringValue = String(value)
        value = stringValue.startsWith('$') ? stringValue : '$' + stringValue
      }

      // PUMPKIN SPECIAL HANDLING: Format signatureDate as MM/DD/YYYY
      if (normalizedInsurer.includes('pumpkin') && ourFieldName === 'signatureDate') {
        const today = new Date()
        const mm = String(today.getMonth() + 1).padStart(2, '0')
        const dd = String(today.getDate()).padStart(2, '0')
        const yyyy = today.getFullYear()
        value = `${mm}/${dd}/${yyyy}`
      }

      // Draw text at coordinates
      const fontSize = coordinates.size || 10
      const textValue = String(value)

      // Use correct page based on coordinates.page property
      const targetPage = coordinates.page === 2 && secondPage ? secondPage : firstPage
      const pageLabel = coordinates.page === 2 ? 'page 2' : 'page 1'

      targetPage.drawText(textValue, {
        x: coordinates.x,
        y: coordinates.y,
        size: fontSize,
        font: helveticaFont,
        color: { type: 'RGB', red: 0, green: 0, blue: 0 }
      })

      // PUMPKIN DEBUG: Log after drawing text
      if (normalizedInsurer.includes('pumpkin')) {
        console.log(`   ✅ Drew text "${textValue}" at (${coordinates.x}, ${coordinates.y}) on ${pageLabel}`)
        console.log(`   Font size: ${fontSize}, Page: ${coordinates.page || 1}\n`)
      } else {
        console.log(`   ✅ ${ourFieldName}: "${textValue}" at (${coordinates.x}, ${coordinates.y}) on ${pageLabel}`)
      }
      fieldsFilled++

    } catch (err) {
      console.warn(`   ⚠️  ${ourFieldName}: ${err.message}`)
      fieldsSkipped++
    }
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`📊 Text Overlay Complete:`)
  console.log(`   Fields filled: ${fieldsFilled}`)
  console.log(`   Fields skipped: ${fieldsSkipped}`)
  console.log('─'.repeat(80) + '\n')

  // Remove unwanted pages from Pumpkin form (keep only pages 1-2, remove pages 3-5 which are fraud notices/FAQ)
  if (normalizedInsurer.includes('pumpkin')) {
    const pageCount = pdfDoc.getPageCount()
    console.log(`📄 Pumpkin PDF has ${pageCount} pages`)

    // Remove pages 3-5 if they exist (keep only pages 1-2 which contain the claim form)
    if (pageCount > 2) {
      console.log(`🗑️  Removing pages 3-${pageCount} (fraud notices/FAQ/legal disclaimers)...`)
      // Remove pages from the end to avoid index shifting
      for (let i = pageCount - 1; i >= 2; i--) {
        pdfDoc.removePage(i)
      }
      console.log(`✅ Kept only pages 1-2 (claim form)\n`)
    }
  }

  // Save and return as buffer
  const filledPdfBytes = await pdfDoc.save()
  return Buffer.from(filledPdfBytes)
}

/**
 * LEGACY: Generate PDF from scratch using jsPDF
 * Used as fallback when no official form is available
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
  // Only show breed if it's available and not "Unknown"
  if (claimData.petBreed && claimData.petBreed !== 'Unknown') {
    yPos = addField('Breed:', claimData.petBreed, yPos)
  }
  // Only show age if it's available and not null
  if (claimData.petAge !== null && claimData.petAge !== undefined) {
    yPos = addField('Age:', `${claimData.petAge} years`, yPos)
  }
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
    'trupanion': 'claims@trupanion.com',
    'pumpkin': 'claims@pumpkin.care'
  }
  const normalizedName = insurer.toLowerCase()
  return emails[normalizedName] || null
}

/**
 * Validate claim data before generating PDF
 * NOTE: This is LEGACY validation - kept minimal for backwards compatibility
 * Insurer-specific validation happens in claimFormMappings.js via getMissingRequiredFields()
 */
export function validateClaimData(claimData) {
  // Minimal validation - only check fields that ALL insurers require
  const required = [
    'policyholderName',
    'policyNumber',
    'petName',
    'petSpecies',
    'treatmentDate',
    'vetClinicName',
    'diagnosis',
    'totalAmount'
    // NOTE: policyholderPhone, policyholderAddress, policyholderEmail removed
    // These are NOT required by all insurers (e.g., Nationwide has no phone field)
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
