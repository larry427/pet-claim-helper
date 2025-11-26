import { generateClaimFormPDF } from './lib/generateClaimPDF.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test claim data
const testClaimData = {
  // Policyholder info
  policyholderName: 'Larry Levin',
  policyholderAddress: '2010 E Hillman Circle, Orange, CA 92867',
  policyholderPhone: '(312) 305-0403',
  policyholderEmail: 'larry@uglydogadventures.com',
  policyNumber: 'nw4321124',

  // Pet info
  petName: 'Neo',
  petSpecies: 'Dog',
  petBreed: 'Bulldog/Chihuahua mix',
  petGender: 'Male',
  petDateOfBirth: '2025-02-25',
  petAge: '0.67', // ~8 months

  // Veterinary info
  vetClinicName: 'Paws & Whiskers Veterinary Clinic',
  vetClinicAddress: '123 Oak Street, Springfield, IL 62701',
  vetClinicPhone: '(555) 123-4567',

  // Claim info
  treatmentDate: '2025-09-25',
  diagnosis: 'Ear Infection Check',

  // Itemized charges (for form filling)
  itemizedCharges: [
    {
      date: '2025-09-25',
      description: 'Follow-up Visit - Ear Infection Check',
      amount: 125.00
    },
    {
      date: '2025-09-25',
      description: 'Antibiotic Prescription (2 weeks)',
      amount: 175.00
    }
  ],

  // Totals
  totalAmount: 300.00
}

// Test signature (simple base64 placeholder - in real use this would be actual signature data)
const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const dateSigned = new Date().toLocaleDateString('en-US')

async function generateAllTestPDFs() {
  console.log('\n🧪 GENERATING TEST PDFs FOR ALL INSURANCE COMPANIES')
  console.log('='.repeat(80))

  const insurers = [
    { name: 'Nationwide', filename: 'test-nationwide-filled.pdf' },
    { name: 'Trupanion', filename: 'test-trupanion-filled.pdf' },
    { name: 'Healthy Paws', filename: 'test-healthypaws-generated.pdf' }
  ]

  for (const insurer of insurers) {
    try {
      console.log(`\n📄 Generating ${insurer.name} PDF...`)

      const pdfBytes = await generateClaimFormPDF(
        insurer.name,
        testClaimData,
        testSignature,
        dateSigned
      )

      const outputPath = path.join(__dirname, insurer.filename)
      fs.writeFileSync(outputPath, pdfBytes)

      console.log(`✅ SUCCESS: ${insurer.name} PDF generated`)
      console.log(`   📁 File: ${outputPath}`)
      console.log(`   📊 Size: ${(pdfBytes.length / 1024).toFixed(2)} KB`)

    } catch (error) {
      console.error(`❌ FAILED: ${insurer.name}`)
      console.error(`   Error: ${error.message}`)
      console.error(error.stack)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('🎉 TEST PDF GENERATION COMPLETE')
  console.log('='.repeat(80))
  console.log('\nGenerated files in server/ directory:')
  console.log('  1. test-nationwide-filled.pdf')
  console.log('  2. test-trupanion-filled.pdf')
  console.log('  3. test-healthypaws-generated.pdf')
  console.log('\nYou can now compare these with the original blank forms!')
  console.log('')
}

// Run the generator
generateAllTestPDFs().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
