import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function inspectPetsBestSignature() {
  const pdfPath = path.join(__dirname, 'server/claim-forms/pets-best-claim-form.pdf')

  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath)
    process.exit(1)
  }

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()

  console.log('\n' + '='.repeat(80))
  console.log('PETS BEST PDF - SIGNATURE FIELD INSPECTION')
  console.log('='.repeat(80) + '\n')

  try {
    const field = form.getField('Signature_1')
    const fieldType = field.constructor.name

    console.log('Field Name: Signature_1')
    console.log('Field Type:', fieldType)
    console.log('Field Class:', field.constructor.name)
    console.log('\nField Details:')
    console.log('  - Is TextField?', fieldType === 'PDFTextField')
    console.log('  - Is Signature?', fieldType === 'PDFSignature')
    console.log('  - Is Button?', fieldType === 'PDFButton')

    if (fieldType === 'PDFTextField') {
      const textField = form.getTextField('Signature_1')
      console.log('\nTextField Properties:')
      console.log('  - Max Length:', textField.getMaxLength() || 'unlimited')
      console.log('  - Is Multiline:', textField.isMultiline())
      console.log('  - Is Password:', textField.isPassword())
      console.log('  - Is File Select:', textField.isFileSelector())
    }

  } catch (e) {
    console.error('Error inspecting Signature_1:', e.message)
  }

  console.log('\n' + '='.repeat(80))
  console.log('ALL FIELDS IN PETS BEST PDF')
  console.log('='.repeat(80) + '\n')

  const fields = form.getFields()
  fields.forEach((field, idx) => {
    console.log(`${idx + 1}. ${field.getName()} - Type: ${field.constructor.name}`)
  })
}

inspectPetsBestSignature().catch(console.error)
