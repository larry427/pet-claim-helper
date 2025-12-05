const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

async function createGridOverlay() {

  // Load the blank Pumpkin claim form
  const pdfPath = path.join(__dirname, 'claim-forms', 'pumpkin-claim-form.pdf');
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Get page 2 (index 1)
  const page = pdfDoc.getPage(1);
  const { width, height } = page.getSize();

  console.log(`Page 2 dimensions: ${width} x ${height} points`);

  // Draw vertical red lines every 50 points (X axis)
  for (let x = 0; x <= width; x += 50) {
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: 0.5,
      color: rgb(1, 0, 0), // Red
      opacity: 0.5
    });

    // Label X coordinate
    page.drawText(String(x), {
      x: x + 2,
      y: height - 15,
      size: 8,
      color: rgb(1, 0, 0)
    });
  }

  // Draw horizontal blue lines every 50 points (Y axis)
  for (let y = 0; y <= height; y += 50) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: 0.5,
      color: rgb(0, 0, 1), // Blue
      opacity: 0.5
    });

    // Label Y coordinate
    page.drawText(String(y), {
      x: 5,
      y: y + 2,
      size: 8,
      color: rgb(0, 0, 1)
    });
  }

  // Save the PDF with grid overlay - save to parent directory
  const outputPath = path.join(__dirname, '..', 'pumpkin-grid-overlay.pdf');
  const modifiedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, modifiedPdfBytes);

  console.log(`\n✅ Grid overlay created: ${outputPath}`);
  console.log(`\nInstructions:`);
  console.log(`1. Open pumpkin-grid-overlay.pdf`);
  console.log(`2. Navigate to page 2`);
  console.log(`3. Find "Is this a claim an estimate for future treatment?"`);
  console.log(`4. Locate the "No" checkbox`);
  console.log(`5. Read the X (red) and Y (blue) coordinates at the CENTER of the checkbox`);
}

createGridOverlay().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
