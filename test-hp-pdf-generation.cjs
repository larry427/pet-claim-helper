require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function testHealthyPawsPDF() {
  console.log('='.repeat(80))
  console.log('🧪 TESTING HEALTHY PAWS PDF GENERATION')
  console.log('='.repeat(80))
  console.log('')

  // Get Bo's pet record
  console.log('1. Fetching Bo (Healthy Paws pet)...')
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', LARRY_USER_ID)
    .eq('name', 'Bo')
    .single()

  if (petError || !pet) {
    console.error('❌ Could not find Bo:', petError?.message)
    return
  }

  console.log(`✅ Found pet: ${pet.name}`)
  console.log(`   Insurance: ${pet.insurance_company}`)
  console.log(`   Policy Number: ${pet.policy_number || 'NOT SET'}`)
  console.log(`   HP Pet ID: ${pet.healthy_paws_pet_id || 'NOT SET'}`)
  console.log('')

  // Get Bo's claim
  console.log('2. Fetching Bo\'s most recent claim...')
  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', LARRY_USER_ID)
    .eq('pet_id', pet.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (claimError || !claim) {
    console.error('❌ Could not find claim:', claimError?.message)
    return
  }

  console.log(`✅ Found claim: ${claim.visit_title || 'Untitled'}`)
  console.log(`   Service Date: ${claim.service_date}`)
  console.log(`   Total: $${claim.total_amount}`)
  console.log(`   Clinic: ${claim.clinic_name}`)
  console.log('')

  // Get Larry's profile
  console.log('3. Fetching user profile...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', LARRY_USER_ID)
    .single()

  if (profileError || !profile) {
    console.error('❌ Could not find profile:', profileError?.message)
    return
  }

  console.log(`✅ Found profile: ${profile.full_name}`)
  console.log(`   Phone: ${profile.phone}`)
  console.log(`   Email: ${profile.email || 'NOT SET'}`)
  console.log(`   Has signature: ${profile.signature ? 'YES' : 'NO'}`)
  console.log('')

  // Import the PDF generation module
  console.log('4. Generating Healthy Paws PDF...')
  const { generateClaimFormPDF } = await import('./server/lib/generateClaimPDF.js')

  // Prepare claim data in the format expected by generateClaimFormPDF
  const claimData = {
    // Policyholder info
    policyholderName: profile.full_name,
    policyholderPhone: profile.phone,
    policyholderEmail: profile.email,
    policyNumber: pet.policy_number,

    // Pet info
    petName: pet.name,
    petSpecies: pet.species,
    healthyPawsPetId: pet.healthy_paws_pet_id,

    // Claim info
    treatmentDate: claim.service_date,
    vetClinicName: claim.clinic_name,
    vetClinicAddress: claim.clinic_address,
    vetClinicPhone: claim.clinic_phone,
    diagnosis: claim.diagnosis || 'Not specified',
    totalAmount: claim.total_amount,
    invoiceNumber: claim.invoice_number,

    // Line items
    itemizedCharges: claim.line_items || []
  }

  const dateSigned = new Date().toLocaleDateString('en-US')

  console.log('   Calling generateClaimFormPDF...')
  console.log(`   Insurer: Healthy Paws`)
  console.log(`   Has signature: ${profile.signature ? 'Yes' : 'No'}`)
  console.log('')

  try {
    const pdfBuffer = await generateClaimFormPDF(
      'Healthy Paws',
      claimData,
      profile.signature,
      dateSigned
    )

    // Save the PDF
    const outputPath = 'test-healthy-paws-bo-claim.pdf'
    fs.writeFileSync(outputPath, pdfBuffer)

    console.log('='.repeat(80))
    console.log('✅ SUCCESS!')
    console.log('='.repeat(80))
    console.log(`   PDF generated: ${outputPath}`)
    console.log(`   File size: ${pdfBuffer.length.toLocaleString()} bytes`)
    console.log('')
    console.log('📄 Open the PDF to verify:')
    console.log(`   open ${outputPath}`)
    console.log('')

  } catch (error) {
    console.error('='.repeat(80))
    console.error('❌ PDF GENERATION FAILED')
    console.error('='.repeat(80))
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
  }
}

testHealthyPawsPDF()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
