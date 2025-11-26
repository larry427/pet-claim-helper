/**
 * Inspect Trupanion PDF form to find all field names and coordinates
 */

const fs = require('fs')
const { PDFDocument } = require('pdf-lib')

async function inspectTrupanionPDF() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('📄 INSPECTING TRUPANION CLAIM FORM')
    console.log('='.repeat(80) + '\n')

    // Load the Trupanion claim form
    const pdfPath = './claim-forms/trupanion-claim-form.pdf'
    console.log('Loading PDF:', pdfPath)

    const pdfBytes = fs.readFileSync(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    console.log(`\nTotal fields found: ${fields.length}\n`)
    console.log('='.repeat(80))

    // Group fields by type
    const fieldsByType = {}

    fields.forEach((field, index) => {
      const name = field.getName()
      const type = field.constructor.name

      if (!fieldsByType[type]) {
        fieldsByType[type] = []
      }
      fieldsByType[type].push({ index, name, field })
    })

    // Display all fields with details
    console.log('\n📋 ALL FORM FIELDS:\n')

    fields.forEach((field, index) => {
      const name = field.getName()
      const type = field.constructor.name

      console.log(`[${index + 1}] ${name}`)
      console.log(`    Type: ${type}`)

      // Try to get widget coordinates
      try {
        const widgets = field.acroField.getWidgets()
        if (widgets && widgets.length > 0) {
          const rect = widgets[0].getRectangle()
          console.log(`    Position: x=${rect.x.toFixed(2)}, y=${rect.y.toFixed(2)}`)
          console.log(`    Size: width=${rect.width.toFixed(2)}, height=${rect.height.toFixed(2)}`)
        }
      } catch (e) {
        console.log(`    (No position data available)`)
      }
      console.log('')
    })

    // Display summary by type
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY BY FIELD TYPE:')
    console.log('='.repeat(80) + '\n')

    Object.keys(fieldsByType).sort().forEach(type => {
      const fieldsOfType = fieldsByType[type]
      console.log(`${type}: ${fieldsOfType.length} fields`)
      fieldsOfType.forEach(({ name }) => {
        console.log(`  - ${name}`)
      })
      console.log('')
    })

    // Look for specific important fields
    console.log('='.repeat(80))
    console.log('🔍 KEY FIELDS TO MAP:')
    console.log('='.repeat(80) + '\n')

    const importantKeywords = [
      'owner', 'name', 'address', 'phone', 'email',
      'pet', 'animal', 'species', 'breed', 'birth', 'age',
      'policy', 'certificate', 'number',
      'vet', 'clinic', 'hospital', 'doctor',
      'date', 'service', 'treatment', 'visit',
      'diagnosis', 'condition', 'symptom',
      'amount', 'total', 'charge', 'cost', 'fee',
      'signature', 'sign'
    ]

    importantKeywords.forEach(keyword => {
      const matchingFields = fields.filter(field =>
        field.getName().toLowerCase().includes(keyword)
      )

      if (matchingFields.length > 0) {
        console.log(`\n"${keyword.toUpperCase()}" fields (${matchingFields.length}):`)
        matchingFields.forEach(field => {
          console.log(`  - ${field.getName()} (${field.constructor.name})`)
        })
      }
    })

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error) {
    console.error('❌ Error inspecting PDF:', error.message)
    console.error(error)
  }
}

inspectTrupanionPDF()
