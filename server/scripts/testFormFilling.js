import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { fileURLToPath } from 'url'
import FORM_FIELD_MAPPINGS from '../lib/claimFormMappings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Test filling official insurance forms with sample data
 * This verifies our field mappings are correct
 */

const SAMPLE_DATA = {
  // Nationwide & Common Fields
  policyholderName: 'John Smith',
  policyholderAddress: '123 Main Street',
  policyholderCity: 'San Francisco',
  policyholderState: 'CA',
  policyholderZip: '94102',
  policyholderPhone: '(415) 555-1234',
  policyholderEmail: 'john.smith@example.com',
  policyNumber: 'NW123456789',

  // Pet
  petName: 'Buddy',
  petDateOfBirth: '05/15/2020',

  // Treatment
  treatmentDateFrom: '01/10/2025',
  treatmentDateTo: '01/10/2025',
  diagnosis: 'Gastroenteritis',

  // Hospital/Clinic (Nationwide)
  hospitalClinic: 'City Veterinary Hospital',
  hospitalName: 'City Veterinary Hospital',

  // Payment (Nationwide)
  totalAmount: '450.00',
  numberOfPages: '2',
  itemCharge1: '250.00',
  itemCharge2: '100.00',
  itemCharge3: '100.00',

  // Trupanion-specific fields
  previousClaimSubmitted: false,
  previousClaimNumber: '',
  dateOfFirstSigns: '01/05/2025',
  additionalInfo: 'First occurrence',
  hasOtherProvider: false,
  paidInFull: true,

  // Generic name/city fields (could be clinic location)
  name1: 'City Veterinary Hospital',
  city1: 'San Francisco',
}

async function testFormFilling(insurerName, pdfPath, mapping) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🧪 TESTING: ${insurerName}`)
  console.log('='.repeat(80))

  try {
    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF NOT FOUND')
      console.log(`   Expected at: ${pdfPath}`)
      return false
    }

    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const form = pdfDoc.getForm()

    console.log(`\n📄 Loaded PDF successfully`)

    // Count fields filled
    let fieldsAttempted = 0
    let fieldsFilled = 0
    let fieldsFailed = 0

    // Fill each mapped field
    console.log(`\n📝 Filling fields:\n`)

    for (const [ourFieldName, pdfFieldName] of Object.entries(mapping)) {
      if (!pdfFieldName) continue // Skip null mappings

      fieldsAttempted++
      const value = SAMPLE_DATA[ourFieldName]

      if (!value) {
        console.log(`   ⚠️  ${ourFieldName} -> ${pdfFieldName}: No sample data`)
        continue
      }

      try {
        const field = form.getField(pdfFieldName)
        const fieldType = field.constructor.name

        if (fieldType === 'PDFTextField') {
          form.getTextField(pdfFieldName).setText(String(value))
          console.log(`   ✅ ${ourFieldName} -> ${pdfFieldName}: "${value}"`)
          fieldsFilled++
        } else if (fieldType === 'PDFCheckBox') {
          if (value === true) {
            form.getCheckBox(pdfFieldName).check()
            console.log(`   ✅ ${ourFieldName} -> ${pdfFieldName}: CHECKED`)
          } else {
            form.getCheckBox(pdfFieldName).uncheck()
            console.log(`   ✅ ${ourFieldName} -> ${pdfFieldName}: UNCHECKED`)
          }
          fieldsFilled++
        } else if (fieldType === 'PDFRadioGroup') {
          // For radio groups, we need to select one of the available options
          const radioGroup = form.getRadioGroup(pdfFieldName)
          const options = radioGroup.getOptions()
          if (options.length > 0) {
            // Select first option if value is truthy, otherwise leave unselected
            if (value) {
              radioGroup.select(options[0])
              console.log(`   ✅ ${ourFieldName} -> ${pdfFieldName}: Selected "${options[0]}"`)
            } else {
              console.log(`   ⚠️  ${ourFieldName} -> ${pdfFieldName}: Skipped (radio group, no value)`)
            }
          }
          fieldsFilled++
        } else {
          console.log(`   ⚠️  ${ourFieldName} -> ${pdfFieldName}: Unsupported type (${fieldType})`)
        }
      } catch (err) {
        console.log(`   ❌ ${ourFieldName} -> ${pdfFieldName}: ERROR - ${err.message}`)
        fieldsFailed++
      }
    }

    // Save filled PDF
    const outputFilename = `test-filled-${insurerName.toLowerCase().replace(/\s+/g, '-')}.pdf`
    const outputPath = path.join(__dirname, '..', outputFilename)

    const filledPdfBytes = await pdfDoc.save()
    fs.writeFileSync(outputPath, filledPdfBytes)

    console.log(`\n${'─'.repeat(80)}`)
    console.log(`📊 RESULTS:`)
    console.log(`   Fields attempted: ${fieldsAttempted}`)
    console.log(`   Fields filled: ${fieldsFilled}`)
    console.log(`   Fields failed: ${fieldsFailed}`)
    console.log(`   Success rate: ${((fieldsFilled / fieldsAttempted) * 100).toFixed(1)}%`)
    console.log(`\n💾 Saved test PDF: ${outputFilename}`)
    console.log('─'.repeat(80))

    return true

  } catch (error) {
    console.error(`\n❌ ERROR:`, error.message)
    console.error('Stack:', error.stack)
    return false
  }
}

async function main() {
  console.log('\n🧪 FORM FILLING TEST SUITE')
  console.log('='.repeat(80))
  console.log('Testing our field mappings with actual insurance PDFs')
  console.log('='.repeat(80))

  const formsDir = path.join(__dirname, '..', 'claim-forms')

  const tests = [
    {
      name: 'Nationwide',
      path: path.join(formsDir, 'nationwide-claim-form.pdf'),
      mapping: FORM_FIELD_MAPPINGS.nationwide
    },
    {
      name: 'Trupanion',
      path: path.join(formsDir, 'trupanion-claim-form.pdf'),
      mapping: FORM_FIELD_MAPPINGS.trupanion
    }
  ]

  const results = {}

  for (const test of tests) {
    results[test.name] = await testFormFilling(test.name, test.path, test.mapping)
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 OVERALL SUMMARY')
  console.log('='.repeat(80))

  for (const test of tests) {
    const status = results[test.name] ? '✅' : '❌'
    console.log(`${status} ${test.name}: ${results[test.name] ? 'PASSED' : 'FAILED'}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('1. Review the generated test PDFs in server/')
  console.log('2. Verify all fields are filled correctly')
  console.log('3. Check field alignment and formatting')
  console.log('4. If tests pass, integrate into generateClaimPDF.js')
  console.log('='.repeat(80) + '\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
