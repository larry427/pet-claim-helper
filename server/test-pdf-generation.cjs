/**
 * Test PDF generation with Neo's complete data
 * Verifies all newly collected fields are properly mapped to PDF form fields
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

// Dynamic import for ES6 module
let generateClaimFormPDF

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testPDFGeneration() {
  console.log('\n' + '='.repeat(80))
  console.log('TESTING PDF GENERATION WITH NEO\'S DATA')
  console.log('='.repeat(80) + '\n')

  // Load ES6 module
  const module = await import('./lib/generateClaimPDF.js')
  generateClaimFormPDF = module.generateClaimFormPDF

  const claimId = '873ab159-1c46-496d-b99b-1e7a9f31d7c4'
  const petId = '91e0b25a-0f3a-40de-a851-fcc0d98ebbf6'

  console.log('Step 1: Fetch Neo\'s data from database')

  // Fetch Neo's pet data
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('*')
    .eq('id', petId)
    .single()

  if (petError) {
    console.error('❌ Error fetching pet:', petError.message)
    process.exit(1)
  }

  console.log('  ✅ Pet data retrieved:')
  console.log('     Name:', pet.name)
  console.log('     Policy #:', pet.policy_number)
  console.log('     Other hospitals:', pet.other_hospitals_visited)
  console.log('     Previous claim:', pet.previous_claim_same_condition)
  console.log('     Payment method:', pet.payment_method)

  // Fetch claim data
  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .select('*')
    .eq('id', claimId)
    .single()

  if (claimError) {
    console.error('❌ Error fetching claim:', claimError.message)
    process.exit(1)
  }

  console.log('\n  ✅ Claim data retrieved:')
  console.log('     ID:', claim.id)
  console.log('     Status:', claim.status)
  console.log('     Visit date:', claim.visit_date)
  console.log('     Diagnosis:', claim.diagnosis)

  // Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', pet.user_id)
    .single()

  if (profileError) {
    console.error('❌ Error fetching profile:', profileError.message)
    process.exit(1)
  }

  console.log('\n  ✅ Profile data retrieved:')
  console.log('     Name:', profile.full_name)
  console.log('     Email:', profile.email)
  console.log('     Phone:', profile.phone)

  console.log('\nStep 2: Prepare claim data for PDF generation')

  const claimData = {
    // Member information
    policyholderName: profile.full_name,
    policyholderPhone: profile.phone,
    policyholderEmail: profile.email,
    policyholderAddress: profile.address,

    // Pet information
    petName: pet.name,
    petDateOfBirth: pet.date_of_birth,
    petBreed: pet.breed,
    petSpecies: pet.species,
    petSpayNeuterStatus: pet.spay_neuter_status,
    petSpayNeuterDate: pet.spay_neuter_date,
    petAdoptionDate: pet.adoption_date,

    // Policy information
    policyNumber: pet.policy_number,
    insuranceCompany: pet.insurance_company,

    // Claim information
    diagnosis: claim.diagnosis,
    treatmentDate: claim.visit_date,
    vetClinicName: claim.vet_clinic_name,
    vetClinicPhone: claim.vet_clinic_phone,
    vetClinicAddress: claim.vet_clinic_address,
    treatingVeterinarian: claim.treating_veterinarian,

    // Newly collected fields (from MissingFieldsModal)
    hadOtherInsurance: pet.had_other_insurance,
    otherInsuranceProvider: pet.other_insurance_provider,
    otherInsuranceCancelDate: pet.other_insurance_cancel_date,
    otherHospitalsVisited: pet.other_hospitals_visited,
    previousClaimSameCondition: pet.previous_claim_same_condition,
    previousClaimNumber: pet.previous_claim_number,
    paymentMethod: pet.payment_method,

    // Signature (use placeholder for test)
    userSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    dateSigned: new Date().toISOString().split('T')[0]
  }

  console.log('\n  ✅ Claim data prepared')
  console.log('\nStep 3: Generate PDF')

  try {
    const pdfBuffer = await generateClaimFormPDF('trupanion', claimData, claimData.userSignature, claimData.dateSigned)

    console.log('  ✅ PDF generated successfully')
    console.log('     Buffer size:', pdfBuffer.length, 'bytes')

    // Save PDF to file
    const outputPath = path.join(__dirname, 'test-output-neo-claim.pdf')
    fs.writeFileSync(outputPath, pdfBuffer)

    console.log('     Saved to:', outputPath)

    console.log('\n' + '='.repeat(80))
    console.log('✅ PDF GENERATION TEST PASSED')
    console.log('='.repeat(80) + '\n')

    console.log('NEXT STEPS:')
    console.log('  1. Open the generated PDF: ' + outputPath)
    console.log('  2. Verify all fields are populated correctly:')
    console.log('     - Policy Number: ' + pet.policy_number)
    console.log('     - Other Hospitals:')
    console.log('       * Name: VCA Emergency → City: Santa Ana')
    console.log('       * Name_2: Banfield Pet Hospital → City_2: Irvine')
    console.log('     - Previous Claim: ' + pet.previous_claim_same_condition)
    console.log('     - Payment Method: ' + pet.payment_method)
    console.log('  3. Take screenshot of PDF showing all populated fields\n')

    // Open the PDF automatically
    const { exec } = require('child_process')
    exec(`open "${outputPath}"`, (error) => {
      if (error) {
        console.log('  ℹ️  Could not auto-open PDF. Please open manually.')
      }
    })

  } catch (error) {
    console.error('❌ PDF generation failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

testPDFGeneration()
