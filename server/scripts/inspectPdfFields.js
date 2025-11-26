import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Inspect PDF form fields to discover field names
 * This is essential for mapping our data to the official insurance forms
 */
async function inspectPdfFields(pdfPath) {
  try {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`📄 INSPECTING: ${path.basename(pdfPath)}`)
    console.log('='.repeat(80))

    if (!fs.existsSync(pdfPath)) {
      console.log('❌ FILE NOT FOUND')
      console.log(`   Please download and place the PDF at: ${pdfPath}`)
      return null
    }

    const pdfBytes = fs.readFileSync(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    if (fields.length === 0) {
      console.log('⚠️  NO FILLABLE FIELDS FOUND')
      console.log('   This PDF may not have form fields, or they may be flattened.')
      console.log('   We may need to use a different approach (OCR or manual positioning).')
      return null
    }

    console.log(`\n✅ Found ${fields.length} fillable fields:\n`)

    const fieldData = []

    fields.forEach((field, index) => {
      const type = field.constructor.name
      const name = field.getName()

      // Try to get more details based on field type
      let details = ''

      try {
        if (type === 'PDFTextField') {
          const textField = form.getTextField(name)
          const maxLength = textField.getMaxLength()
          details = maxLength ? ` (max length: ${maxLength})` : ''
        } else if (type === 'PDFCheckBox') {
          details = ' (checkbox)'
        } else if (type === 'PDFRadioGroup') {
          const radioGroup = form.getRadioGroup(name)
          const options = radioGroup.getOptions()
          details = ` (options: ${options.join(', ')})`
        } else if (type === 'PDFDropdown') {
          const dropdown = form.getDropdown(name)
          const options = dropdown.getOptions()
          details = ` (dropdown: ${options.join(', ')})`
        }
      } catch (err) {
        // Some fields might throw errors, that's okay
      }

      console.log(`${String(index + 1).padStart(3)}. ${name}`)
      console.log(`     Type: ${type}${details}`)

      fieldData.push({ index: index + 1, name, type, details })
    })

    console.log(`\n${'─'.repeat(80)}`)
    console.log(`Total: ${fields.length} fields`)
    console.log('─'.repeat(80) + '\n')

    return fieldData

  } catch (error) {
    console.error(`\n❌ ERROR inspecting PDF:`, error.message)
    console.error('Stack:', error.stack)
    return null
  }
}

/**
 * Main execution - inspect all 3 insurance forms
 */
async function main() {
  console.log('\n🔍 PDF FORM FIELD INSPECTOR')
  console.log('='.repeat(80))
  console.log('This script inspects official insurance claim forms to discover')
  console.log('all fillable field names, which we\'ll use to map our data.')
  console.log('='.repeat(80))

  const formsDir = path.join(__dirname, '..', 'claim-forms')

  const forms = [
    {
      name: 'Nationwide',
      path: path.join(formsDir, 'nationwide-claim-form.pdf')
    },
    {
      name: 'Healthy Paws',
      path: path.join(formsDir, 'healthypaws-claim-form.pdf')
    },
    {
      name: 'Trupanion',
      path: path.join(formsDir, 'trupanion-claim-form.pdf')
    }
  ]

  const results = {}

  for (const form of forms) {
    const fieldData = await inspectPdfFields(form.path)
    results[form.name] = fieldData
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 SUMMARY')
  console.log('='.repeat(80))

  for (const form of forms) {
    const fieldCount = results[form.name]?.length || 0
    const status = fieldCount > 0 ? '✅' : '❌'
    console.log(`${status} ${form.name}: ${fieldCount} fields`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('1. Review the field names above')
  console.log('2. Update server/lib/claimFormMappings.js with the correct mappings')
  console.log('3. Test filling each form with sample data')
  console.log('='.repeat(80) + '\n')

  // If any forms are missing, show instructions
  const missingForms = forms.filter(f => !results[f.name])
  if (missingForms.length > 0) {
    console.log('⚠️  MISSING FORMS:')
    missingForms.forEach(f => {
      console.log(`   - ${path.basename(f.path)}`)
    })
    console.log('\nPlease download the missing PDFs and place them in:')
    console.log(`   ${formsDir}/\n`)
  }
}

// Run the inspector
main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
