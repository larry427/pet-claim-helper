#!/usr/bin/env node
/**
 * Extract page 1 from Spot claim form PDF and save to server/lib/forms/
 */

import fs from 'fs'
import { PDFDocument } from 'pdf-lib'

async function extractPage1() {
  console.log('\n' + '='.repeat(80))
  console.log('📄 EXTRACTING PAGE 1 FROM SPOT CLAIM FORM')
  console.log('='.repeat(80) + '\n')

  try {
    // Read source PDF
    const sourcePath = '/Users/larrylevin/Downloads/pet-claim-helper/server/claim-forms/Spot_Claim_Form.pdf'
    console.log('1. Reading source PDF:', sourcePath)

    if (!fs.existsSync(sourcePath)) {
      console.error('   ❌ Source file not found!')
      return
    }

    const sourceBytes = fs.readFileSync(sourcePath)
    console.log('   ✅ Source file loaded:', sourceBytes.length, 'bytes')

    // Load PDF
    const sourcePdf = await PDFDocument.load(sourceBytes)
    const totalPages = sourcePdf.getPageCount()
    console.log('   📄 Total pages:', totalPages)

    // Create new PDF with only page 1
    console.log('\n2. Extracting page 1...')
    const newPdf = await PDFDocument.create()
    const [firstPage] = await newPdf.copyPages(sourcePdf, [0])
    newPdf.addPage(firstPage)
    console.log('   ✅ Page 1 extracted')

    // Save to destination
    const destPath = '/Users/larrylevin/Downloads/pet-claim-helper/server/lib/forms/spot_claim_form.pdf'
    console.log('\n3. Saving to:', destPath)

    const pdfBytes = await newPdf.save()
    fs.writeFileSync(destPath, pdfBytes)

    console.log('   ✅ File saved successfully!')
    console.log('   📊 Original size:', sourceBytes.length, 'bytes')
    console.log('   📊 New size:', pdfBytes.length, 'bytes')
    console.log('   📊 Reduction:', ((1 - pdfBytes.length / sourceBytes.length) * 100).toFixed(1) + '%')
    console.log('   📄 Pages: 1 (extracted from', totalPages + ')')

    // Verify file exists
    console.log('\n4. Verifying file...')
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath)
      console.log('   ✅ File exists at:', destPath)
      console.log('   📊 Size:', stats.size, 'bytes')
      console.log('   📅 Created:', stats.birthtime)

      // Verify it's a valid PDF with 1 page
      const verifyBytes = fs.readFileSync(destPath)
      const verifyPdf = await PDFDocument.load(verifyBytes)
      console.log('   📄 Pages in saved file:', verifyPdf.getPageCount())

      if (verifyPdf.getPageCount() === 1) {
        console.log('\n' + '='.repeat(80))
        console.log('✅ SUCCESS - Spot claim form page 1 saved successfully!')
        console.log('='.repeat(80) + '\n')
      } else {
        console.log('\n❌ ERROR - Expected 1 page, found:', verifyPdf.getPageCount())
      }
    } else {
      console.log('   ❌ ERROR - File was not created!')
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error)
  }
}

extractPage1()
