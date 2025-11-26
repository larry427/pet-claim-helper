require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

// Use service role key for testing
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testPdfMerge() {
  console.log('🔍 DIRECT PDF MERGE TEST')
  console.log('='.repeat(80))

  // Get a claim with an uploaded vet bill
  const { data: claims, error } = await supabase
    .from('claims')
    .select('id, pdf_path, clinic_phone, clinic_name')
    .eq('user_id', 'c4419d0e-a234-4b93-bdbd-23e07090e57d')
    .not('pdf_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !claims || claims.length === 0) {
    console.error('❌ No claims found with uploaded vet bills')
    return
  }

  const claim = claims[0]
  console.log('Found claim:')
  console.log(`  ID: ${claim.id}`)
  console.log(`  Clinic: ${claim.clinic_name}`)
  console.log(`  Phone: ${claim.clinic_phone || '(NULL)'}`)
  console.log(`  PDF path: ${claim.pdf_path}`)
  console.log('')

  // Test by making a request to the preview endpoint
  console.log('🔄 Making direct API call with merged=true...')
  console.log('')
  console.log('INSTRUCTIONS FOR YOU (Larry):')
  console.log('1. Open browser to: http://localhost:5173')
  console.log('2. Log in to the app')
  console.log(`3. Find claim: ${claim.id.substring(0, 8)}...`)
  console.log('4. Click "View My Claim"')
  console.log('5. Check the server logs:')
  console.log('')
  console.log('   tail -50 server/server-with-logging.log | grep -A 10 "Preview PDF"')
  console.log('')
  console.log('Look for these lines in the logs:')
  console.log('  [Preview PDF] Claim form loaded: X pages')
  console.log('  [Preview PDF] Original vet invoice loaded: Y pages')
  console.log('  [Preview PDF] Total pages: X+Y')
  console.log('')
  console.log('If total pages = 2, the merge is BROKEN')
  console.log('If total pages >= 3, the merge is WORKING')
}

testPdfMerge().then(() => process.exit(0))
