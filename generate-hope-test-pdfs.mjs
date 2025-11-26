import { generateClaimFormPDF } from './server/lib/generateClaimPDF.js'
import fs from 'fs'
import { execSync } from 'child_process'

console.log('\n' + '═'.repeat(80))
console.log('🧪 GENERATING TEST PDFs FOR ALL 3 INSURANCE COMPANIES')
console.log('Using Hope\'s Real Data')
console.log('═'.repeat(80) + '\n')

// Hope's real data from database
const hopeData = {
  // Owner info (Larry)
  policyholderName: 'Larry Levin1',
  policyholderAddress: '2010 E Hillman Circle Orange CA 92867',
  policyholderPhone: '+13123050403',
  policyholderEmail: 'larry@uglydogadventures.com',

  // Pet info (Hope)
  petName: 'Hope',
  petSpecies: 'Dog',
  petBreed: 'Unknown', // Not in database
  petAge: null, // No date_of_birth
  petDateOfBirth: null,
  petAdoptionDate: '2025-03-27',
  petSpayNeuterDate: '2025-08-01',

  // Vet info
  vetClinicName: 'Dr. Shaydah',
  vetClinicAddress: '', // Not available
  vetClinicPhone: '',

  // Sample claim data (no actual claims in database)
  treatmentDate: '2025-11-15',
  diagnosis: 'Routine checkup',
  bodyPartAffected: 'General',
  totalAmount: 150.00,
  itemizedCharges: [
    { description: 'Examination', amount: 75.00 },
    { description: 'Vaccinations', amount: 75.00 }
  ],

  // Insurance info
  hadOtherInsurance: 'No',
  previousClaimSameCondition: 'No',
  paymentMethod: 'I have paid in full'
}

// Create a simple signature for testing (1x50 transparent PNG with "Larry" text)
// Base64 encoded 1px transparent PNG
const DUMMY_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

async function generatePDF(insuranceCompany, policyNumber, filename) {
  console.log(`\n📄 Generating ${insuranceCompany} PDF...`)
  console.log(`   Policy Number: ${policyNumber}`)
  console.log(`   Output: ${filename}`)

  try {
    const claimData = {
      ...hopeData,
      policyNumber: policyNumber
    }

    // Use dummy signature for Nationwide & Healthy Paws (Trupanion doesn't need it)
    const signature = (insuranceCompany === 'Trupanion') ? null : DUMMY_SIGNATURE

    const pdfBuffer = await generateClaimFormPDF(
      insuranceCompany,
      claimData,
      signature,
      '11/17/2025'
    )

    fs.writeFileSync(filename, pdfBuffer)
    console.log(`   ✅ SUCCESS: PDF saved`)

    return { success: true, filename }
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`)
    return { success: false, error: error.message }
  }
}

// Generate all 3 PDFs
const results = []

// 1. TRUPANION - Use Hope's REAL policy number
const trupanionResult = await generatePDF(
  'Trupanion',
  'tp143222', // Hope's real Trupanion policy
  '/Users/larrylevin/Downloads/TEST-trupanion-hope.pdf'
)
results.push({ company: 'Trupanion', ...trupanionResult })

// 2. NATIONWIDE - Use placeholder policy
const nationwideResult = await generatePDF(
  'Nationwide',
  'NW123456', // Placeholder
  '/Users/larrylevin/Downloads/TEST-nationwide-hope.pdf'
)
results.push({ company: 'Nationwide', ...nationwideResult })

// 3. HEALTHY PAWS - Use placeholder policy
const healthyPawsResult = await generatePDF(
  'Healthy Paws',
  'HP123456', // Placeholder
  '/Users/larrylevin/Downloads/TEST-healthypaws-hope.pdf'
)
results.push({ company: 'Healthy Paws', ...healthyPawsResult })

// Report Results
console.log('\n' + '═'.repeat(80))
console.log('📊 GENERATION RESULTS')
console.log('═'.repeat(80))

for (const result of results) {
  console.log(`\n${result.company}:`)
  if (result.success) {
    console.log(`  ✅ SUCCESS`)
    console.log(`  📁 ${result.filename}`)
  } else {
    console.log(`  ❌ FAILED: ${result.error}`)
  }
}

// Open all successful PDFs
console.log('\n' + '═'.repeat(80))
console.log('📂 Opening PDFs...')
console.log('═'.repeat(80) + '\n')

for (const result of results) {
  if (result.success) {
    try {
      execSync(`open "${result.filename}"`)
      console.log(`✅ Opened: ${result.filename}`)
    } catch (err) {
      console.log(`⚠️  Could not open: ${result.filename}`)
    }
  }
}

console.log('\n' + '═'.repeat(80))
console.log('✅ COMPLETE')
console.log('═'.repeat(80) + '\n')
