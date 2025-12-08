const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function listFields() {
  const pdfPath = 'server/lib/forms/spot_claim_form.pdf';
  console.log('Reading PDF from:', pdfPath);
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SPOT PDF FORM FIELDS (${fields.length} total)`);
  console.log('='.repeat(80));

  fields.forEach((f, index) => {
    console.log(`${index + 1}. "${f.getName()}" (${f.constructor.name})`);
  });

  console.log('='.repeat(80) + '\n');
}

listFields().catch(err => console.error('Error:', err));
