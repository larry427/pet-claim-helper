const { PDFDocument } = require('pdf-lib')
const fs = require('fs')
const path = require('path')

async function inspectHealthyPawsPDF() {
  console.log('='.repeat(80))
  console.log('🔍 INSPECTING HEALTHY PAWS CLAIM FORM PDF')
  console.log('='.repeat(80))

  // Load the HP claim form
  const pdfPath = path.join(__dirname, 'claim-forms', 'Healthy Paws blank form.pdf')

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ PDF not found: ${pdfPath}`)
    return
  }

  console.log(`✅ Found PDF: ${pdfPath}`)
  console.log(`   File size: ${fs.statSync(pdfPath).size.toLocaleString()} bytes\n`)

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  console.log(`📄 Total pages: ${pdfDoc.getPageCount()}`)

  // Get page dimensions
  const pages = pdfDoc.getPages()
  pages.forEach((page, index) => {
    const { width, height } = page.getSize()
    console.log(`   Page ${index + 1}: ${width.toFixed(2)} x ${height.toFixed(2)} points`)
  })
  console.log('')

  // Try to get form
  try {
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    console.log(`📝 Form Fields Found: ${fields.length}`)
    console.log('='.repeat(80))

    if (fields.length === 0) {
      console.log('⚠️  NO FORM FIELDS FOUND')
      console.log('   This is a FLAT PDF (non-fillable)')
      console.log('   Need to use Option B: pdf-lib text overlay\n')

      console.log('📍 Field Coordinates Strategy:')
      console.log('   1. Open PDF in Adobe Acrobat or Preview')
      console.log('   2. Measure field positions manually')
      console.log('   3. Add text overlays using pdf-lib drawText()')
      console.log('   4. Reference Trupanion/Nationwide implementations\n')

      // Show how to add text to flat PDF
      console.log('Example code for flat PDF text overlay:')
      console.log('─'.repeat(80))
      console.log(`const pages = pdfDoc.getPages()`)
      console.log(`const firstPage = pages[0]`)
      console.log(`const { width, height } = firstPage.getSize()`)
      console.log(``)
      console.log(`// Draw text at specific coordinates`)
      console.log(`firstPage.drawText('Policy Number: 123456', {`)
      console.log(`  x: 100,`)
      console.log(`  y: 700,`)
      console.log(`  size: 10,`)
      console.log(`  font: helveticaFont`)
      console.log(`})`)
      console.log('─'.repeat(80))

    } else {
      console.log('\n✅ FORM FIELDS FOUND (PDF is fillable)\n')

      fields.forEach((field, index) => {
        const type = field.constructor.name
        const name = field.getName()

        console.log(`${index + 1}. ${name}`)
        console.log(`   Type: ${type}`)

        if (type === 'PDFTextField') {
          const textField = form.getTextField(name)
          const defaultValue = textField.getText() || '(empty)'
          const maxLength = textField.getMaxLength() || 'unlimited'
          console.log(`   Default: ${defaultValue}`)
          console.log(`   Max Length: ${maxLength}`)
        } else if (type === 'PDFCheckBox') {
          const checkbox = form.getCheckBox(name)
          const isChecked = checkbox.isChecked()
          console.log(`   Checked: ${isChecked}`)
        } else if (type === 'PDFRadioGroup') {
          const radioGroup = form.getRadioGroup(name)
          const options = radioGroup.getOptions()
          const selected = radioGroup.getSelected()
          console.log(`   Options: [${options.join(', ')}]`)
          console.log(`   Selected: ${selected || '(none)'}`)
        } else if (type === 'PDFDropdown') {
          const dropdown = form.getDropdown(name)
          const options = dropdown.getOptions()
          const selected = dropdown.getSelected()
          console.log(`   Options: [${options.join(', ')}]`)
          console.log(`   Selected: ${selected.join(', ') || '(none)'}`)
        }

        console.log('')
      })

      console.log('='.repeat(80))
      console.log(`Total fields: ${fields.length}`)
    }

  } catch (err) {
    console.error('❌ Error reading form:', err.message)
    console.log('   This PDF likely has no form fields (flat PDF)')
  }
}

inspectHealthyPawsPDF()
  .then(() => {
    console.log('\n✅ Inspection complete')
    process.exit(0)
  })
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
