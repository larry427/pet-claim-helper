import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function inspectTrupanion() {
  const pdfPath = path.join(__dirname, '..', 'claim-forms', 'trupanion-claim-form.pdf')

  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()
  const fields = form.getFields()

  console.log(`\n✅ Found ${fields.length} fillable fields in Trupanion form:\n`)

  fields.forEach((field, index) => {
    const type = field.constructor.name
    const name = field.getName()

    // Show exact field name with quotes and escape sequences visible
    console.log(`${String(index + 1).padStart(3)}. Field name: "${name}"`)
    console.log(`     Type: ${type}`)
    console.log(`     Raw bytes: ${JSON.stringify(name)}`)
    console.log()
  })
}

inspectTrupanion().catch(console.error)
