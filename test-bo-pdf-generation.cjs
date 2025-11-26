require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

async function testPDF() {
  console.log('Finding Bo and his most recent claim...\n')

  // Find Bo
  const { data: bo, error: boError } = await supabase
    .from('pets')
    .select('id, name, healthy_paws_pet_id')
    .eq('user_id', LARRY_USER_ID)
    .eq('name', 'Bo')
    .single()

  if (boError || !bo) {
    console.error('Could not find Bo:', boError)
    return
  }

  console.log('Pet: ' + bo.name)
  console.log('HP Pet ID in database: ' + (bo.healthy_paws_pet_id || 'NULL'))
  console.log('')

  // Find Bo's most recent claim
  const { data: claims, error: claimError } = await supabase
    .from('claims')
    .select('id, created_at')
    .eq('pet_id', bo.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (claimError || !claims || claims.length === 0) {
    console.error('No claims found for Bo')
    return
  }

  const claimId = claims[0].id
  console.log('Found claim ID: ' + claimId)
  console.log('Now calling preview-pdf endpoint...\n')

  // Call the preview-pdf endpoint
  const response = await fetch(`http://localhost:8787/api/claims/${claimId}/preview-pdf`, {
    headers: {
      'user-id': LARRY_USER_ID
    }
  })

  if (!response.ok) {
    console.error('Preview PDF request failed:', response.status, response.statusText)
    const text = await response.text()
    console.error('Response:', text)
    return
  }

  const pdfBuffer = await response.arrayBuffer()
  const outputPath = 'test-bo-hp-pet-id.pdf'
  fs.writeFileSync(outputPath, Buffer.from(pdfBuffer))

  console.log('✅ PDF generated: ' + outputPath)
  console.log('\nOpen the PDF and check if "14680p" appears at Pet Id field (355, 500)')
}

testPDF()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
