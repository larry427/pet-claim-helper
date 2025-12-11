#!/usr/bin/env node
/**
 * Test script to diagnose Pets Best PDF structure issues
 * Usage: node test-pets-best-pdf.mjs
 */

import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testPetsBestPDF() {
  const pdfPath = path.join(__dirname, 'claim-forms', 'pets-best-claim-form.pdf')

  console.log('='.repeat(80))
  console.log('TESTING PETS BEST PDF')
  console.log('='.repeat(80))
  console.log(`PDF Path: ${pdfPath}`)
  console.log()

  // Check if file exists
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF file not found!')
    return
  }

  const stats = fs.statSync(pdfPath)
  console.log(`✅ File exists: ${(stats.size / 1024).toFixed(2)} KB`)
  console.log()

  // Try to load the PDF
  try {
    const pdfBytes = fs.readFileSync(pdfPath)
    console.log(`📄 Reading PDF bytes... (${pdfBytes.length} bytes)`)

    const pdfDoc = await PDFDocument.load(pdfBytes)
    console.log(`✅ PDF loaded successfully!`)
    console.log()

    // Get page count
    const pageCount = pdfDoc.getPageCount()
    console.log(`📄 Pages: ${pageCount}`)

    // Get form fields
    const form = pdfDoc.getForm()
    const fields = form.getFields()
    console.log(`📝 Form fields: ${fields.length}`)
    console.log()

    // List all field names
    if (fields.length > 0) {
      console.log('Field names:')
      fields.forEach((field, index) => {
        const name = field.getName()
        const type = field.constructor.name
        console.log(`  ${index + 1}. "${name}" (${type})`)
      })
      console.log()
    }

    // Try removing page 2+ (if exists)
    if (pageCount > 1) {
      console.log(`🗑️  Testing page removal (keeping only page 1)...`)
      for (let i = pageCount - 1; i >= 1; i--) {
        pdfDoc.removePage(i)
        console.log(`   Removed page ${i + 1}`)
      }
      console.log(`✅ Page removal successful! Now ${pdfDoc.getPageCount()} page(s)`)
      console.log()
    }

    // Try to save the modified PDF
    console.log('💾 Testing PDF save...')
    const modifiedBytes = await pdfDoc.save()
    console.log(`✅ PDF saved successfully! (${modifiedBytes.length} bytes)`)
    console.log()

    console.log('='.repeat(80))
    console.log('✅ ALL TESTS PASSED - PDF is valid and can be processed!')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('❌ ERROR:', error.message)
    console.error()
    console.error('Stack trace:')
    console.error(error.stack)
    console.log()
    console.log('='.repeat(80))
    console.log('❌ TEST FAILED - PDF has structure issues')
    console.log('='.repeat(80))
  }
}

testPetsBestPDF()
