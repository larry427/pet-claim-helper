const { generateClaimFormPDF } = require('./server/lib/generateClaimPDF.js')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
require('dotenv').config({ path: './server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Dynamic import for pdf-parse (ES module)
async function getPdfParse() {
  const module = await import('pdf-parse')
  return module.default
}

async function runTest() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTING PUMPKIN PDF WITH REAL DATA FROM DATABASE')
  console.log('='.repeat(80))
  console.log()

  try {
    // Step 1: Get Larry's profile
    console.log('📋 Step 1: Fetching Larry\'s profile...')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'larry@uglydogadventures.com')
      .single()

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError.message)
      return
    }

    console.log('✅ Profile found:')
    console.log(`   Name: ${profile.full_name}`)
    console.log(`   Address: ${profile.address}`)
    console.log(`   City: ${profile.city}`)
    console.log(`   State: ${profile.state}`)
    console.log(`   Zip: ${profile.zip}`)
    console.log(`   Phone: ${profile.phone}`)
    console.log(`   Email: ${profile.email}`)

    // Step 2: Get Angel's pet data
    console.log('\n🐾 Step 2: Fetching Angel\'s pet data...')
    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', profile.id)

    if (petsError) {
      console.error('❌ Error fetching pets:', petsError.message)
      return
    }

    const angel = pets.find(p => p.name === 'Angel')
    if (!angel) {
      console.error('❌ Angel not found')
      return
    }

    console.log('✅ Angel found:')
    console.log(`   Name: ${angel.name}`)
    console.log(`   Species: ${angel.species}`)
    console.log(`   Breed: ${angel.breed}`)
    console.log(`   Date of Birth: ${angel.date_of_birth}`)
    console.log(`   Pumpkin Account #: ${angel.pumpkin_account_number}`)

    // Step 3: Build claimData exactly as server/index.js does
    console.log('\n📦 Step 3: Building claimData object (matching server/index.js)...')

    const claimData = {
      policyholderName: profile.full_name || profile.email,
      policyholderAddress: profile.address || '',
      policyholderPhone: profile.phone || '',
      policyholderEmail: profile.email,
      // Address fields for Pumpkin
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      zip: profile.zip || '',
      policyNumber: angel.policy_number || 'N/A',
      pumpkinAccountNumber: angel.pumpkin_account_number || '',
      petName: angel.name,
      petSpecies: angel.species,
      breed: angel.breed || '',
      petBreed: angel.breed || '',
      petDateOfBirth: angel.date_of_birth,
      treatmentDate: '2025-01-15',
      vetClinicName: 'Test Veterinary Clinic',
      vetClinicPhone: '555-987-6543',
      diagnosis: 'Annual checkup',
      claimType: 'Preventive',
      totalAmount: 150.00,
      invoiceAttached: false
    }

    console.log('\n🔍 CRITICAL FIELDS TO VERIFY:')
    console.log('   city:', claimData.city)
    console.log('   state:', claimData.state)
    console.log('   zip:', claimData.zip)
    console.log('   breed:', claimData.breed)
    console.log('   pumpkinAccountNumber:', claimData.pumpkinAccountNumber)

    // Step 4: Generate PDF
    console.log('\n📄 Step 4: Generating Pumpkin PDF...')
    const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    const pdfBuffer = await generateClaimFormPDF(
      'pumpkin',
      claimData,
      testSignature,
      new Date().toISOString().split('T')[0]
    )

    console.log(`✅ PDF generated (${pdfBuffer.length} bytes)`)

    // Step 5: Save PDF
    const outputPath = 'pumpkin-real-data-output.pdf'
    fs.writeFileSync(outputPath, pdfBuffer)
    console.log(`✅ PDF saved to ${outputPath}`)

    // Step 6: Extract and verify text
    console.log('\n📖 Step 5: Extracting text from PDF...')
    const pdfParse = await getPdfParse()
    const pdfData = await pdfParse(pdfBuffer)
    const pdfText = pdfData.text

    console.log(`✅ Extracted ${pdfText.length} characters from ${pdfData.numpages} pages`)

    // Step 7: Verify the 5 critical fields
    console.log('\n' + '='.repeat(80))
    console.log('🔍 VERIFYING THE 5 CRITICAL FIELDS IN PDF TEXT')
    console.log('='.repeat(80))

    const fieldsToCheck = [
      { name: 'City', expected: profile.city, found: null },
      { name: 'State', expected: profile.state, found: null },
      { name: 'Zip', expected: profile.zip, found: null },
      { name: 'Breed', expected: angel.breed, found: null },
      { name: 'Pumpkin Account #', expected: angel.pumpkin_account_number, found: null }
    ]

    for (const field of fieldsToCheck) {
      const found = pdfText.includes(field.expected)
      field.found = found
      const status = found ? '✅ FOUND' : '❌ NOT FOUND'
      console.log(`${status} | ${field.name.padEnd(20)} | Expected: "${field.expected}"`)
    }

    // Step 8: Show excerpt of PDF text for manual verification
    console.log('\n' + '='.repeat(80))
    console.log('📄 PDF TEXT EXCERPT (first 1000 chars):')
    console.log('='.repeat(80))
    console.log(pdfText.substring(0, 1000))
    console.log('...')

    // Step 9: Final verdict
    const allFound = fieldsToCheck.every(f => f.found)
    console.log('\n' + '='.repeat(80))
    if (allFound) {
      console.log('✅✅✅ SUCCESS! ALL 5 FIELDS FOUND IN PDF ✅✅✅')
    } else {
      console.log('❌❌❌ FAILURE! SOME FIELDS MISSING FROM PDF ❌❌❌')
      const missing = fieldsToCheck.filter(f => !f.found).map(f => f.name)
      console.log(`Missing fields: ${missing.join(', ')}`)
    }
    console.log('='.repeat(80))

    console.log(`\n📂 Open ${outputPath} to manually verify the PDF`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

runTest().catch(console.error)
