require('dotenv').config({ path: '.env.local' })
const fetch = require('node-fetch')
const fs = require('fs')

async function testPdfMerge() {
  console.log('🔍 TESTING PDF MERGE FUNCTIONALITY')
  console.log('='.repeat(80))

  // Use one of the existing claims with clinic_phone saved
  const claimId = '6ecca8fc-3945-4cb9-a036-c8715583b562'

  console.log(`Testing with claim ID: ${claimId}`)
  console.log('This claim has:')
  console.log('  - clinic_phone: (949) 936-0066')
  console.log('  - Uploaded vet bill')
  console.log('')

  console.log('🔄 Requesting merged PDF preview...')
  const apiUrl = 'http://localhost:8787'

  try {
    // Request merged PDF
    const response = await fetch(`${apiUrl}/api/claims/${claimId}/preview-pdf?merged=true`)

    if (!response.ok) {
      console.error('❌ API request failed:', response.status, response.statusText)
      const text = await response.text()
      console.error('Response:', text)
      return
    }

    // Save PDF to file
    const pdfBuffer = await response.arrayBuffer()
    const outputPath = '/Users/larrylevin/Downloads/pet-claim-helper/test-merged-output.pdf'
    fs.writeFileSync(outputPath, Buffer.from(pdfBuffer))

    console.log('✅ PDF received and saved')
    console.log(`   File: ${outputPath}`)
    console.log(`   Size: ${pdfBuffer.byteLength} bytes`)
    console.log('')

    // Analyze the PDF to count pages
    const { PDFDocument } = require('./server/node_modules/pdf-lib')
    const pdf = await PDFDocument.load(Buffer.from(pdfBuffer))
    const pageCount = pdf.getPageCount()

    console.log('='.repeat(80))
    console.log('📊 PDF ANALYSIS:')
    console.log(`   Total pages in merged PDF: ${pageCount}`)
    console.log('='.repeat(80))
    console.log('')

    if (pageCount <= 2) {
      console.log('❌ MERGE FAILED!')
      console.log('   Expected: 3+ pages (claim form + vet bill)')
      console.log(`   Got: ${pageCount} pages (only claim form)`)
      console.log('')
      console.log('   The original vet bill was NOT included in the merge.')
    } else {
      console.log('✅ MERGE SUCCESSFUL!')
      console.log(`   Merged PDF contains ${pageCount} pages`)
      console.log('   This includes BOTH the claim form AND the original vet bill')
    }
    console.log('')
    console.log('Check the server logs for detailed merge information:')
    console.log('  tail -50 server/server-with-logging.log | grep "Preview PDF"')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error(error)
  }
}

testPdfMerge().then(() => process.exit(0))
