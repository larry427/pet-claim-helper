import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function inspectFigoPDF() {
  const pdfPath = path.join(__dirname, 'server/claim-forms/figo_claim_form.pdf')

  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath)
    process.exit(1)
  }

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()

  console.log('\n' + '='.repeat(80))
  console.log('FIGO PDF - ALL FORM FIELDS')
  console.log('='.repeat(80) + '\n')

  const fields = form.getFields()
  console.log(`Total fields: ${fields.length}\n`)

  fields.forEach((field, idx) => {
    const name = field.getName()
    const type = field.constructor.name
    console.log(`${idx + 1}. ${name} - Type: ${type}`)
  })

  console.log('\n' + '='.repeat(80))
  console.log('SIGNATURE/IMAGE FIELDS')
  console.log('='.repeat(80) + '\n')

  const signatureFields = fields.filter(f =>
    f.getName().toLowerCase().includes('sign') ||
    f.getName().toLowerCase().includes('image') ||
    f.constructor.name === 'PDFSignature' ||
    f.constructor.name === 'PDFButton'
  )

  if (signatureFields.length === 0) {
    console.log('No signature or image fields found!')
  } else {
    signatureFields.forEach(field => {
      console.log(`Field: ${field.getName()}`)
      console.log(`Type: ${field.constructor.name}`)
      console.log('')
    })
  }
}

inspectFigoPDF().catch(console.error)
