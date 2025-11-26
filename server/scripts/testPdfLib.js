import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'

/**
 * Test script to verify pdf-lib is installed and working correctly
 * Creates a simple test PDF to confirm the library can:
 * - Create documents
 * - Add pages
 * - Add text
 * - Save to file
 */
async function testPdfLib() {
  try {
    console.log('🧪 Testing pdf-lib installation...\n')

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create()

    // Add a page
    const page = pdfDoc.addPage([600, 400])

    // Get font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    // Draw text
    page.drawText('pdf-lib is working correctly!', {
      x: 50,
      y: 350,
      size: 20,
      font: font,
      color: rgb(0, 0.5, 0)
    })

    page.drawText('This test PDF was created by pdf-lib', {
      x: 50,
      y: 300,
      size: 12,
      font: font,
      color: rgb(0, 0, 0)
    })

    page.drawText('Ready to fill official insurance claim forms!', {
      x: 50,
      y: 250,
      size: 12,
      font: font,
      color: rgb(0, 0, 0)
    })

    // Save PDF
    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync('test-pdf-lib-output.pdf', pdfBytes)

    console.log('✅ SUCCESS!')
    console.log('   - Created PDF document')
    console.log('   - Added page')
    console.log('   - Added text')
    console.log('   - Saved to file: test-pdf-lib-output.pdf')
    console.log('\npdf-lib is ready to use! 🎉\n')

  } catch (error) {
    console.error('❌ ERROR:', error.message)
    console.error('\nStack:', error.stack)
    process.exit(1)
  }
}

testPdfLib()
