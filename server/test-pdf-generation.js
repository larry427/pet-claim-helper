import { generateClaimFormPDF, validateClaimData, getInsurerClaimEmail } from './lib/generateClaimPDF.js'
import fs from 'fs'
import path from 'path'

console.log('🧪 TESTING PDF GENERATION FOR CLAIM FORMS')
console.log('='.repeat(80))

// Sample claim data
const sampleClaimData = {
  policyholderName: 'John Smith',
  policyholderAddress: '123 Main Street, Los Angeles, CA 90001',
  policyholderPhone: '(555) 123-4567',
  policyholderEmail: 'john.smith@example.com',
  policyNumber: 'NW-12345678',
  petName: 'Buddy',
  petSpecies: 'Dog',
  petBreed: 'Golden Retriever',
  petAge: 5,
  treatmentDate: '2025-11-10',
  vetClinicName: 'Westside Veterinary Hospital',
  vetClinicAddress: '456 Vet Avenue, Los Angeles, CA 90002',
  vetClinicPhone: '(555) 987-6543',
  diagnosis: 'Laceration on left front paw requiring sutures. Patient presented with a 2-inch cut that occurred during outdoor play. Wound was cleaned, sutured with 8 stitches, and bandaged. Prescribed antibiotics and pain medication. Follow-up appointment scheduled for suture removal in 10 days.',
  totalAmount: 487.50,
  itemizedCharges: [
    { description: 'Office Visit / Examination', amount: 85.00 },
    { description: 'Wound Cleaning and Preparation', amount: 120.00 },
    { description: 'Suture Application (8 stitches)', amount: 180.00 },
    { description: 'Bandaging and Dressing', amount: 45.00 },
    { description: 'Amoxicillin (10-day supply)', amount: 32.50 },
    { description: 'Pain Medication (5-day supply)', amount: 25.00 }
  ]
}

const insurers = ['nationwide', 'healthypaws', 'trupanion']

async function testPDFGeneration() {
  for (const insurer of insurers) {
    console.log(`\n📄 Generating PDF for: ${insurer.toUpperCase()}`)
    console.log('-'.repeat(80))

    try {
      // Validate claim data
      validateClaimData(sampleClaimData)
      console.log('✅ Claim data validation passed')

      // Get insurer email
      const email = getInsurerClaimEmail(insurer)
      console.log(`📧 Insurer email: ${email}`)

      // Generate PDF
      const pdfBuffer = await generateClaimFormPDF(
        insurer,
        sampleClaimData,
        'John Smith', // Text signature
        new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      )

      console.log(`✅ PDF generated successfully (${pdfBuffer.length} bytes)`)

      // Save to file for manual inspection
      const filename = `test-claim-${insurer}.pdf`
      const filepath = path.join(process.cwd(), filename)
      fs.writeFileSync(filepath, pdfBuffer)
      console.log(`💾 Saved to: ${filepath}`)

    } catch (error) {
      console.error(`❌ Error generating PDF for ${insurer}:`, error.message)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ PDF GENERATION TEST COMPLETE')
  console.log('\nGenerated files:')
  insurers.forEach(ins => {
    console.log(`  - test-claim-${ins}.pdf`)
  })
  console.log('\nOpen these PDFs to verify formatting and content.')
}

// Run test
testPDFGeneration().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
