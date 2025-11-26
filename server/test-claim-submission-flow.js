import { generateClaimFormPDF, validateClaimData } from './lib/generateClaimPDF.js'
// Don't import sendClaimEmail yet - it requires RESEND_API_KEY
// import { sendClaimEmail } from './lib/sendClaimEmail.js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') })

console.log('🧪 TESTING COMPLETE CLAIM SUBMISSION FLOW')
console.log('='.repeat(80))

// Sample claim data
const sampleClaimData = {
  policyholderName: 'Larry Levin',
  policyholderAddress: '789 Sunset Blvd, Los Angeles, CA 90028',
  policyholderPhone: '(310) 555-1234',
  policyholderEmail: 'larry@example.com', // Will be BCC'd on the email
  policyNumber: 'NW-TEST-2025',
  petName: 'Max',
  petSpecies: 'Dog',
  petBreed: 'Labrador Retriever',
  petAge: 3,
  treatmentDate: '2025-11-14',
  vetClinicName: 'Beverly Hills Animal Clinic',
  vetClinicAddress: '1234 Rodeo Drive, Beverly Hills, CA 90210',
  vetClinicPhone: '(310) 555-9876',
  diagnosis: 'Acute gastroenteritis following dietary indiscretion. Patient presented with vomiting and diarrhea for 24 hours. Physical examination revealed moderate dehydration. Treatment included subcutaneous fluids, anti-nausea medication, and gastrointestinal protectants. Patient responded well to treatment and was discharged with dietary instructions and probiotics.',
  totalAmount: 342.75,
  itemizedCharges: [
    { description: 'Emergency Examination', amount: 125.00 },
    { description: 'Subcutaneous Fluid Therapy', amount: 85.00 },
    { description: 'Anti-nausea Injection (Cerenia)', amount: 45.00 },
    { description: 'Gastrointestinal Medication', amount: 38.50 },
    { description: 'Probiotics (14-day supply)', amount: 28.25 },
    { description: 'Diagnostic Blood Work', amount: 21.00 }
  ],
  invoiceAttached: false // For now, we're only sending the claim form
}

async function testClaimSubmissionFlow() {
  console.log('\n📋 STEP 1: Validate Claim Data')
  console.log('-'.repeat(80))

  try {
    validateClaimData(sampleClaimData)
    console.log('✅ Claim data validation passed')
  } catch (error) {
    console.error('❌ Validation failed:', error.message)
    return
  }

  console.log('\n📄 STEP 2: Generate Claim Form PDF')
  console.log('-'.repeat(80))

  let pdfBuffer
  try {
    pdfBuffer = await generateClaimFormPDF(
      'nationwide',
      sampleClaimData,
      'Larry Levin', // Text signature
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    )
    console.log(`✅ PDF generated successfully (${pdfBuffer.length} bytes)`)
  } catch (error) {
    console.error('❌ PDF generation failed:', error.message)
    return
  }

  console.log('\n📧 STEP 3: Send Claim Email to Insurer')
  console.log('-'.repeat(80))
  console.log('⚠️  This will send a REAL email to the test insurer address')
  console.log('    To: claims@petinsurance.com (Nationwide)')
  console.log('    BCC: larry@example.com (Policyholder)')
  console.log('')

  // For safety, let's not actually send in automated tests
  // Uncomment below to send real email
  /*
  try {
    const result = await sendClaimEmail('nationwide', sampleClaimData, pdfBuffer)

    if (result.success) {
      console.log('✅ Email sent successfully!')
      console.log(`   Message ID: ${result.messageId}`)
    } else {
      console.error('❌ Email sending failed:', result.error)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
  }
  */

  console.log('⏸️  Email sending SKIPPED (uncomment code to send real email)')
  console.log('   This is to prevent accidental spam during development')

  console.log('\n' + '='.repeat(80))
  console.log('✅ CLAIM SUBMISSION FLOW TEST COMPLETE')
  console.log('\nFlow verified:')
  console.log('  1. ✅ Claim data validation')
  console.log('  2. ✅ PDF generation')
  console.log('  3. ⏸️  Email sending (ready, but skipped for safety)')
  console.log('\nTo enable real email sending:')
  console.log('  1. Ensure RESEND_API_KEY is set in .env.local')
  console.log('  2. Uncomment the email sending code in this test')
  console.log('  3. Run: node test-claim-submission-flow.js')
}

// Run test
testClaimSubmissionFlow().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
