/**
 * Test Trupanion PDF generation with sample data
 * Verifies all fields populate correctly
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateClaimFormPDF } from './lib/generateClaimPDF.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function generateTrupanionTestPDF() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 GENERATING TRUPANION TEST PDF')
  console.log('='.repeat(80) + '\n')

  // Sample signature (1x1 transparent PNG in base64)
  const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  // Comprehensive test data
  const testClaimData = {
    // Policyholder info
    policyholderName: 'Larry Levin',
    policyholderEmail: 'larry@example.com',
    policyholderPhone: '(312) 305-0403',
    policyNumber: 'TR-12345678',

    // Pet info
    petName: 'Neo',
    petDateOfBirth: '2020-01-15',
    petAdoptionDate: '2020-03-20',
    petSpayNeuterStatus: 'yes',
    petSpayNeuterDate: '2020-04-01',

    // Veterinary info
    vetClinicName: 'Paws & Whiskers Veterinary Clinic',
    treatingVeterinarian: 'Dr. Sarah Johnson',
    preferredVetName: 'Dr. Sarah Johnson', // Fallback

    // Claim info
    diagnosis: 'Ear infection',
    treatmentDate: '2025-09-25',
  }

  const dateSigned = '11/16/2025'

  try {
    console.log('📋 Test Claim Data:')
    console.log(JSON.stringify(testClaimData, null, 2))
    console.log()

    console.log('🖊️  Signature: [Test signature provided]')
    console.log()

    console.log('📄 Generating Trupanion PDF...\n')

    // Generate the PDF
    const pdfBuffer = await generateClaimFormPDF(
      'trupanion',
      testClaimData,
      testSignature,
      dateSigned
    )

    // Save the PDF
    const outputPath = path.join(__dirname, 'trupanion-test-claim.pdf')
    fs.writeFileSync(outputPath, pdfBuffer)

    console.log('\n' + '='.repeat(80))
    console.log('✅ SUCCESS!')
    console.log('='.repeat(80))
    console.log()
    console.log(`📁 PDF saved to: ${outputPath}`)
    console.log()
    console.log('🔍 VERIFICATION CHECKLIST:')
    console.log('   □ Policyholder name: Larry Levin')
    console.log('   □ Preferred phone: (312) 305-0403')
    console.log('   □ Pet name: Neo')
    console.log('   □ Policy number: TR-12345678')
    console.log('   □ Hospital name: Paws & Whiskers Veterinary Clinic')
    console.log('   □ Treating veterinarian: Dr. Sarah Johnson')
    console.log('   □ Diagnosis: Ear infection')
    console.log('   □ Date of first signs: 09/25/2025')
    console.log('   □ Pet DOB: 01/15/2020')
    console.log('   □ Date of adoption: 03/20/2020')
    console.log('   □ Spay/Neuter Date: 04/01/2020')
    console.log('   □ Spay Neuter radio: Yes selected')
    console.log('   □ Signature embedded at (150, 150)')
    console.log()
    console.log('👀 Open the PDF and verify all fields are populated correctly!')
    console.log()
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n' + '='.repeat(80))
    console.error('❌ ERROR GENERATING PDF')
    console.error('='.repeat(80))
    console.error()
    console.error('Error:', error.message)
    console.error()
    console.error('Stack trace:')
    console.error(error.stack)
    console.error()
    console.error('='.repeat(80) + '\n')
    process.exit(1)
  }
}

// Run the test
generateTrupanionTestPDF()
