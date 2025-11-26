import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateClaimFormPDF } from '../lib/generateClaimPDF.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Test the integrated claim PDF generation with real claim data
 * Tests all 3 insurers:
 * - Nationwide (official form)
 * - Trupanion (official form)
 * - Healthy Paws (generated PDF)
 */

// Realistic claim data
const SAMPLE_CLAIM_DATA = {
  policyholderName: 'Sarah Johnson',
  policyholderAddress: '742 Evergreen Terrace, Springfield, IL 62701',
  policyholderPhone: '5551234567',
  policyholderEmail: 'sarah.johnson@example.com',
  policyNumber: 'PET-2024-123456',

  petName: 'Max',
  petSpecies: 'Dog',
  petBreed: 'Golden Retriever',
  petAge: 5,
  petDateOfBirth: '2019-03-15',

  treatmentDate: '2025-01-10',
  vetClinicName: 'Springfield Veterinary Hospital',
  vetClinicAddress: '456 Oak Avenue, Springfield, IL 62702',
  vetClinicPhone: '5559876543',

  diagnosis: 'Acute gastroenteritis with vomiting and diarrhea. Patient presented with lethargy and loss of appetite. Treated with IV fluids, anti-nausea medication, and antibiotics.',

  totalAmount: 487.50,

  itemizedCharges: [
    { description: 'Office Visit & Exam', amount: 95.00 },
    { description: 'Blood Work (CBC & Chemistry Panel)', amount: 165.00 },
    { description: 'IV Fluid Therapy', amount: 125.00 },
    { description: 'Medications (Anti-nausea, Antibiotics)', amount: 72.50 },
    { description: 'Follow-up Care Instructions', amount: 30.00 }
  ]
}

const insurers = [
  { name: 'Nationwide', method: 'Official PDF Form' },
  { name: 'Trupanion', method: 'Official PDF Form' },
  { name: 'Healthy Paws', method: 'Generated PDF' }
]

async function testInsurer(insurerName, expectedMethod) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🧪 TESTING: ${insurerName}`)
  console.log(`   Expected Method: ${expectedMethod}`)
  console.log(`${'='.repeat(80)}`)

  try {
    const startTime = Date.now()

    // Generate the PDF
    const pdfBuffer = await generateClaimFormPDF(
      insurerName,
      SAMPLE_CLAIM_DATA,
      'Sarah Johnson', // Signature
      new Date().toLocaleDateString('en-US') // Date signed
    )

    const duration = Date.now() - startTime

    // Save the PDF
    const filename = `test-claim-${insurerName.toLowerCase().replace(/\s+/g, '-')}.pdf`
    const outputPath = path.join(__dirname, '..', filename)
    fs.writeFileSync(outputPath, pdfBuffer)

    console.log(`\n✅ SUCCESS!`)
    console.log(`   Generated in: ${duration}ms`)
    console.log(`   PDF Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`)
    console.log(`   Saved to: ${filename}`)
    console.log(`${'─'.repeat(80)}`)

    return {
      insurer: insurerName,
      success: true,
      duration,
      size: pdfBuffer.length,
      filename
    }

  } catch (error) {
    console.error(`\n❌ FAILED!`)
    console.error(`   Error: ${error.message}`)
    console.error(`   Stack: ${error.stack}`)
    console.log(`${'─'.repeat(80)}`)

    return {
      insurer: insurerName,
      success: false,
      error: error.message
    }
  }
}

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 CLAIM PDF GENERATION - INTEGRATION TEST')
  console.log('='.repeat(80))
  console.log('Testing with realistic claim data for all 3 insurers')
  console.log('='.repeat(80))

  console.log('\n📋 Test Claim Data:')
  console.log(`   Policyholder: ${SAMPLE_CLAIM_DATA.policyholderName}`)
  console.log(`   Pet: ${SAMPLE_CLAIM_DATA.petName} (${SAMPLE_CLAIM_DATA.petSpecies})`)
  console.log(`   Treatment Date: ${SAMPLE_CLAIM_DATA.treatmentDate}`)
  console.log(`   Total Amount: $${SAMPLE_CLAIM_DATA.totalAmount.toFixed(2)}`)
  console.log(`   Diagnosis: ${SAMPLE_CLAIM_DATA.diagnosis.substring(0, 60)}...`)

  const results = []

  for (const insurer of insurers) {
    const result = await testInsurer(insurer.name, insurer.method)
    results.push(result)
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(80))

  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log(`\nTotal Tests: ${results.length}`)
  console.log(`Passed: ${successful.length}`)
  console.log(`Failed: ${failed.length}`)

  console.log('\n' + '─'.repeat(80))
  console.log('RESULTS BY INSURER:')
  console.log('─'.repeat(80))

  results.forEach(result => {
    const status = result.success ? '✅' : '❌'
    console.log(`${status} ${result.insurer}`)
    if (result.success) {
      console.log(`   Duration: ${result.duration}ms`)
      console.log(`   Size: ${(result.size / 1024).toFixed(2)} KB`)
      console.log(`   File: ${result.filename}`)
    } else {
      console.log(`   Error: ${result.error}`)
    }
    console.log()
  })

  console.log('='.repeat(80))
  console.log('NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('1. Review the generated PDFs in server/')
  console.log('2. Open each PDF and verify:')
  console.log('   - All fields are filled correctly')
  console.log('   - Formatting looks professional')
  console.log('   - Data is properly aligned')
  console.log('   - No fields are cut off or overlapping')
  console.log('3. For Nationwide & Trupanion:')
  console.log('   - Verify official form branding is present')
  console.log('   - Check that forms are flattened (non-editable)')
  console.log('4. For Healthy Paws:')
  console.log('   - Verify generated PDF looks professional')
  console.log('   - Check all sections are complete')
  console.log('5. If all tests pass, integration is ready!')
  console.log('='.repeat(80) + '\n')

  // Exit code
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
