const { generateClaimFormPDF } = require('./server/lib/generateClaimPDF.js')
const fs = require('fs')

// Dynamic import for pdf-parse (ES module)
async function getPdfParse() {
  const module = await import('pdf-parse')
  return module.default
}

// Test data matching the structure server/index.js uses (flattened)
const TEST_CLAIM_DATA = {
  // Policyholder info
  policyholderName: 'Auto Test User',
  policyholderAddress: '100 Test Street',
  policyholderPhone: '+15555555555',
  policyholderEmail: 'pch-autotest@petclaimhelper.com',
  address: '100 Test Street',
  city: 'Testville',
  state: 'CA',
  zip: '90210',

  // Pet info
  petName: 'TestCat',
  petSpecies: 'cat',
  breed: 'Tabby',  // For Pumpkin form field
  petBreed: 'Tabby',  // For invoice preview
  petAge: 5,
  petDateOfBirth: '2020-01-01',
  pumpkinAccountNumber: 'TEST-123456',

  // Vet info
  vetClinicName: 'Test Veterinary Clinic',
  vetClinicAddress: '',
  vetClinicPhone: '555-987-6543',

  // Claim info
  totalAmount: 100.00,
  treatmentDate: '2025-01-01',
  diagnosis: 'Test diagnosis',
  claimType: 'Illness',
  invoiceAttached: false
}

// Expected values in the PDF
const EXPECTED_FIELDS = {
  // Page 1 - Pet Parent Information
  'Auto Test User': 'Policyholder Name',
  '100 Test Street': 'Address',
  'Testville': 'City',
  'CA': 'State',
  '90210': 'ZIP Code',
  '+15555555555': 'Phone',
  'pch-autotest@petclaimhelper.com': 'Email',

  // Page 1 - Pet Information
  'TestCat': 'Pet Name',
  'TEST-123456': 'Pumpkin Account Number',
  'Tabby': 'Breed',
  '5': 'Age (calculated from DOB)',

  // Page 2 - Vet Information
  'Test Veterinary Clinic': 'Veterinary Clinic',

  // Page 2 - Claim Information
  '$100.00': 'Total Amount',
  'Test diagnosis': 'Diagnosis'
}

async function runTest() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING PUMPKIN PDF GENERATION (Direct API)')
  console.log('='.repeat(80))
  console.log('\n📋 Test Data:')
  console.log(`   Pet: ${TEST_CLAIM_DATA.petName} (${TEST_CLAIM_DATA.petBreed})`)
  console.log(`   Owner: ${TEST_CLAIM_DATA.policyholderName}`)
  console.log(`   Address: ${TEST_CLAIM_DATA.city}, ${TEST_CLAIM_DATA.state} ${TEST_CLAIM_DATA.zip}`)
  console.log(`   Account: ${TEST_CLAIM_DATA.pumpkinAccountNumber}`)
  console.log(`   Claim Type: ${TEST_CLAIM_DATA.claimType}\n`)

  try {
    // Create a minimal test signature (1x1 transparent PNG)
    const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    // Step 1: Generate PDF
    console.log('📄 Step 1: Generating Pumpkin claim PDF...')
    const pdfBuffer = await generateClaimFormPDF(
      'pumpkin',
      TEST_CLAIM_DATA,
      testSignature, // Test signature
      new Date().toISOString().split('T')[0] // Today's date
    )

    console.log(`   ✅ PDF generated (${pdfBuffer.length} bytes)`)

    // Step 2: Save PDF to file
    const outputPath = 'test-pumpkin-claim-output.pdf'
    fs.writeFileSync(outputPath, pdfBuffer)
    console.log(`   ✅ PDF saved to ${outputPath}`)

    // Step 3: Extract text from PDF
    console.log('\n📖 Step 2: Extracting text from PDF...')
    const pdfParse = await getPdfParse()
    const pdfData = await pdfParse(pdfBuffer)
    const pdfText = pdfData.text

    console.log(`   ✅ Extracted ${pdfText.length} characters from PDF`)
    console.log(`   ✅ PDF has ${pdfData.numpages} pages\n`)

    // Step 4: Verify fields
    console.log('✅ Step 3: Verifying PDF field population...\n')
    console.log('=' .repeat(80))

    let passCount = 0
    let failCount = 0
    const results = []

    for (const [expectedValue, fieldName] of Object.entries(EXPECTED_FIELDS)) {
      const found = pdfText.includes(expectedValue)
      const status = found ? '✅ PASS' : '❌ FAIL'
      const resultLine = `${status} | ${fieldName.padEnd(30)} | Expected: "${expectedValue}"`
      results.push({ status: found ? 'PASS' : 'FAIL', line: resultLine })

      if (found) {
        passCount++
      } else {
        failCount++
      }
    }

    // Print all results
    results.forEach(r => console.log(r.line))

    console.log('=' .repeat(80))
    console.log(`\n📊 RESULTS: ${passCount} PASS / ${failCount} FAIL (${results.length} total fields)`)

    // Additional check: Claim type checkbox
    console.log('\n🔍 Additional Checks:')
    const hasIllnessMarker = pdfText.includes('X') || pdfText.includes('✓') || pdfText.includes('✔')
    console.log(`${hasIllnessMarker ? '✅' : '❌'} | Claim Type Marker (X/✓) present`)

    if (failCount === 0) {
      console.log('\n✅ ALL TESTS PASSED! Pumpkin PDF generation is working correctly.')
    } else {
      console.log(`\n⚠️  ${failCount} field(s) failed verification. Check PDF generation logic.`)
      console.log(`\n💡 Tip: Open ${outputPath} manually to inspect the generated PDF.`)
    }

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

runTest().catch(console.error)
