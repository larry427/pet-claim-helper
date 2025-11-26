import { generateClaimFormPDF } from './server/lib/generateClaimPDF.js'
import fs from 'fs'

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
  petDateOfBirth: '2024-01-15',
  petAdoptionDate: '2025-03-27',
  petSpayNeuterDate: '2025-08-01',
  treatmentDate: '2025-11-15',
  vetClinicName: 'Happy Paws Vet Clinic',
  diagnosis: 'Ear infection',
  bodyPartAffected: 'Ear',
  totalAmount: 250.00,
  itemizedCharges: [],
  hadOtherInsurance: 'No',
  previousClaimSameCondition: 'No',
  paymentMethod: 'I have paid in full'
}

console.log('\n🧪 TESTING PLACEHOLDER CLEARING FIX\n')
console.log('Test Data:')
console.log('- petDateOfBirth:', testClaimData.petDateOfBirth)
console.log('- petAdoptionDate:', testClaimData.petAdoptionDate)
console.log('- petSpayNeuterDate:', testClaimData.petSpayNeuterDate)
console.log('')

const pdfBuffer = await generateClaimFormPDF('Trupanion', testClaimData, null, '11/17/2025')
const outputPath = '/tmp/test-trupanion-no-placeholders.pdf'
fs.writeFileSync(outputPath, pdfBuffer)

console.log(`\n✅ PDF SAVED: ${outputPath}`)
console.log('\n📋 EXPECTED RESULTS:')
console.log('- Date of Birth: 01/15/2024 (NOT "01/15/2024/YY")')
console.log('- Date of Adoption: 03/27/2025 (NOT "03/27/2025/YY")')
console.log('- Spay/Neuter Date: 08/01/2025 (NOT "08/01/2025/YY")')
console.log('- Empty fields: BLANK (NOT "MM/DD/YY" or "If known")')
console.log('\nOpening PDF for visual inspection...\n')
