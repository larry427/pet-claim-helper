import { generateClaimFormPDF } from './server/lib/generateClaimPDF.js'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'

async function testTrupanionPDF() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING TRUPANION PDF GENERATION')
  console.log('='.repeat(80) + '\n')

  // Simulate Hope's claim data
  const testClaimData = {
    policyholderName: 'Larry Levin',
    policyholderAddress: '123 Main St, San Francisco, CA 94102',
    policyholderPhone: '5551234567',
    policyholderEmail: 'larry@uglydogadventures.com',
    policyNumber: 'TP123456',
    petName: 'Hope',
    petSpecies: 'Dog',
    petBreed: 'Mixed',
    petAge: 2,
    petDateOfBirth: null, // Hope doesn't have this yet
    petAdoptionDate: '2025-03-27', // Hope HAS this
    petSpayNeuterDate: '2025-08-01', // Hope HAS this
    treatmentDate: '2025-11-15',
    vetClinicName: 'Happy Paws Vet Clinic',
    vetClinicAddress: '456 Oak St, San Francisco, CA 94103',
    vetClinicPhone: '5559876543',
    diagnosis: 'Ear infection',
    bodyPartAffected: 'Ear',
    totalAmount: 250.00,
    itemizedCharges: [
      { description: 'Exam', amount: 75.00 },
      { description: 'Medication', amount: 175.00 }
    ],
    hadOtherInsurance: 'No',
    previousClaimSameCondition: 'No',
    paymentMethod: 'I have paid in full'
  }

  console.log('📋 Test Data:')
  console.log('petAdoptionDate:', testClaimData.petAdoptionDate)
  console.log('petSpayNeuterDate:', testClaimData.petSpayNeuterDate)
  console.log('petDateOfBirth:', testClaimData.petDateOfBirth)
  console.log('')

  try {
    // Generate PDF
    console.log('📄 Generating PDF...\n')
    const pdfBuffer = await generateClaimFormPDF(
      'Trupanion',
      testClaimData,
      null, // No signature
      '11/17/2025'
    )

    // Save to file
    const outputPath = '/tmp/test-trupanion-hope.pdf'
    fs.writeFileSync(outputPath, pdfBuffer)
    console.log(`✅ PDF saved to: ${outputPath}\n`)

    // Read back and extract field values
    console.log('🔍 Reading generated PDF to verify field values...\n')
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    console.log('📊 EXTRACTED FIELD VALUES:')
    console.log('='.repeat(80))

    // Get specific fields we care about
    const fieldsToCheck = [
      'Date of Adoption',
      'Spay/Neuter Date',
      'Date of Birth',
      'Pet Name',
      'Policy Number',
      'Owner Name',
      'Phone'
    ]

    for (const fieldName of fieldsToCheck) {
      try {
        const field = form.getField(fieldName)
        const fieldType = field.constructor.name
        let value = 'N/A'

        if (fieldType === 'PDFTextField') {
          value = field.getText() || '(empty)'
        } else if (fieldType === 'PDFCheckBox') {
          value = field.isChecked() ? 'CHECKED' : 'UNCHECKED'
        } else if (fieldType === 'PDFRadioGroup') {
          value = field.getSelected() || '(none selected)'
        }

        console.log(`${fieldName}: "${value}" (${fieldType})`)
      } catch (e) {
        console.log(`${fieldName}: FIELD NOT FOUND`)
      }
    }

    console.log('='.repeat(80))

    // List ALL fields in the PDF for debugging
    console.log('\n📋 ALL FIELDS IN PDF:')
    console.log('='.repeat(80))
    let count = 0
    for (const field of fields) {
      const name = field.getName()
      const type = field.constructor.name
      count++

      let value = ''
      if (type === 'PDFTextField') {
        value = field.getText() || ''
      } else if (type === 'PDFCheckBox') {
        value = field.isChecked() ? '☑' : '☐'
      } else if (type === 'PDFRadioGroup') {
        value = field.getSelected() || ''
      }

      if (value) {
        console.log(`${count}. "${name}" (${type}): "${value}"`)
      }
    }
    console.log('='.repeat(80))
    console.log(`Total fields in form: ${fields.length}`)
    console.log(`Fields with values: ${count}`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

testTrupanionPDF()
