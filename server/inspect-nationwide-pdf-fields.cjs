/**
 * Inspect Nationwide PDF form to find signature field coordinates
 */

const fs = require('fs')
const { PDFDocument } = require('pdf-lib')

async function inspectNationwidePDF() {
  console.log('\n' + '='.repeat(80))
  console.log('📄 INSPECTING NATIONWIDE PDF FORM')
  console.log('='.repeat(80) + '\n')

  const pdfPath = './claim-forms/nationwide-claim-form.pdf'
  console.log('Loading PDF:', pdfPath)

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()
  const fields = form.getFields()

  console.log(`\nTotal fields found: ${fields.length}\n`)

  let signatureFields = []

  fields.forEach((field, index) => {
    const name = field.getName()
    const type = field.constructor.name

    // Look for signature-related fields
    const isSignatureRelated = name.toLowerCase().includes('signature') ||
                               name.toLowerCase().includes('sign') ||
                               name.toLowerCase().includes('date')

    if (isSignatureRelated) {
      console.log(`\n[${ index + 1 }] ${name}`)
      console.log(`    Type: ${type}`)

      try {
        const widgets = field.acroField.getWidgets()
        if (widgets && widgets.length > 0) {
          const widget = widgets[0]
          const rect = widget.getRectangle()

          console.log(`    Position: x=${rect.x}, y=${rect.y}`)
          console.log(`    Size: width=${rect.width}, height=${rect.height}`)

          signatureFields.push({
            name,
            type,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          })
        }
      } catch (err) {
        console.log(`    (Could not get position: ${err.message})`)
      }
    }
  })

  // Also check all fields to see their positions
  console.log('\n' + '='.repeat(80))
  console.log('ALL FORM FIELDS WITH POSITIONS:')
  console.log('='.repeat(80) + '\n')

  fields.forEach((field, index) => {
    const name = field.getName()
    const type = field.constructor.name

    try {
      const widgets = field.acroField.getWidgets()
      if (widgets && widgets.length > 0) {
        const widget = widgets[0]
        const rect = widget.getRectangle()

        console.log(`[${index + 1}] ${name}`)
        console.log(`    Type: ${type}`)
        console.log(`    Position: (${rect.x}, ${rect.y})`)
        console.log(`    Size: ${rect.width} x ${rect.height}`)
      }
    } catch (err) {
      // Skip fields without widgets
    }
  })

  console.log('\n' + '='.repeat(80))
  console.log('SIGNATURE FIELD SUMMARY:')
  console.log('='.repeat(80))

  if (signatureFields.length > 0) {
    signatureFields.forEach(field => {
      console.log(`\n${field.name}:`)
      console.log(`  const signatureX = ${field.x}`)
      console.log(`  const signatureY = ${field.y}`)
      console.log(`  const signatureWidth = ${field.width}`)
      console.log(`  const signatureHeight = ${field.height}`)
    })
  } else {
    console.log('\n⚠️  No signature field found!')
    console.log('The PDF may not have a dedicated signature field.')
    console.log('Signature will need to be drawn directly on the page.')
  }

  console.log('\n' + '='.repeat(80) + '\n')
}

inspectNationwidePDF().catch(err => {
  console.error('Error:', err)
})
