const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const fs = require('fs')
const path = require('path')

async function createCoordinateGrid() {
  console.log('='.repeat(80))
  console.log('📐 CREATING COORDINATE GRID FOR HEALTHY PAWS FORM')
  console.log('='.repeat(80))

  // Load the HP claim form
  const pdfPath = path.join(__dirname, 'claim-forms', 'Healthy Paws blank form.pdf')
  const pdfBytes = fs.readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width, height } = firstPage.getSize()

  console.log(`\n📄 Page dimensions: ${width} x ${height} points`)
  console.log(`   (1 point = 1/72 inch)\n`)

  // Load font for labels
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontSize = 8

  // Draw coordinate grid
  const gridSpacing = 50 // Grid line every 50 points
  const majorGridSpacing = 100 // Thicker line every 100 points

  console.log('Drawing coordinate grid...')
  console.log(`   Grid spacing: ${gridSpacing} points`)
  console.log(`   Major grid lines: ${majorGridSpacing} points\n`)

  // Vertical lines (X-axis)
  for (let x = 0; x <= width; x += gridSpacing) {
    const isMajor = x % majorGridSpacing === 0
    const lineWidth = isMajor ? 0.75 : 0.25
    const opacity = isMajor ? 0.5 : 0.3

    firstPage.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: lineWidth,
      color: rgb(1, 0, 0),
      opacity
    })

    // Label major grid lines
    if (isMajor) {
      firstPage.drawText(`${x}`, {
        x: x + 2,
        y: height - 15,
        size: fontSize,
        font,
        color: rgb(1, 0, 0),
        opacity: 0.7
      })

      // Also label at bottom
      firstPage.drawText(`${x}`, {
        x: x + 2,
        y: 5,
        size: fontSize,
        font,
        color: rgb(1, 0, 0),
        opacity: 0.7
      })
    }
  }

  // Horizontal lines (Y-axis)
  for (let y = 0; y <= height; y += gridSpacing) {
    const isMajor = y % majorGridSpacing === 0
    const lineWidth = isMajor ? 0.75 : 0.25
    const opacity = isMajor ? 0.5 : 0.3

    firstPage.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: lineWidth,
      color: rgb(0, 0, 1),
      opacity
    })

    // Label major grid lines
    if (isMajor) {
      firstPage.drawText(`${y}`, {
        x: 5,
        y: y + 2,
        size: fontSize,
        font,
        color: rgb(0, 0, 1),
        opacity: 0.7
      })

      // Also label at right edge
      firstPage.drawText(`${y}`, {
        x: width - 25,
        y: y + 2,
        size: fontSize,
        font,
        color: rgb(0, 0, 1),
        opacity: 0.7
      })
    }
  }

  // Add corner reference points
  const cornerSize = 5
  const corners = [
    { x: 0, y: 0, label: '(0,0)' },
    { x: width, y: 0, label: `(${width},0)` },
    { x: 0, y: height, label: `(0,${height})` },
    { x: width, y: height, label: `(${width},${height})` }
  ]

  corners.forEach(corner => {
    firstPage.drawCircle({
      x: corner.x,
      y: corner.y,
      size: cornerSize,
      color: rgb(0, 1, 0),
      opacity: 0.8
    })

    // Label corners
    const labelOffset = 10
    let labelX = corner.x + labelOffset
    let labelY = corner.y + labelOffset

    // Adjust label position based on corner
    if (corner.x === width) labelX = corner.x - 60
    if (corner.y === 0) labelY = corner.y + 15

    firstPage.drawText(corner.label, {
      x: labelX,
      y: labelY,
      size: fontSize + 2,
      font,
      color: rgb(0, 1, 0),
      opacity: 0.8
    })
  })

  // Add legend
  const legendX = 50
  const legendY = height - 100
  const legendSpacing = 15

  firstPage.drawRectangle({
    x: legendX - 5,
    y: legendY - 5,
    width: 220,
    height: 80,
    color: rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1
  })

  firstPage.drawText('COORDINATE GRID LEGEND', {
    x: legendX,
    y: legendY + 60,
    size: 10,
    font,
    color: rgb(0, 0, 0)
  })

  firstPage.drawText('Red lines = X-axis (horizontal position)', {
    x: legendX,
    y: legendY + 40,
    size: fontSize,
    font,
    color: rgb(1, 0, 0)
  })

  firstPage.drawText('Blue lines = Y-axis (vertical position)', {
    x: legendX,
    y: legendY + 25,
    size: fontSize,
    font,
    color: rgb(0, 0, 1)
  })

  firstPage.drawText('Major lines every 100 points', {
    x: legendX,
    y: legendY + 10,
    size: fontSize,
    font,
    color: rgb(0, 0, 0)
  })

  firstPage.drawText('Origin (0,0) = bottom-left corner', {
    x: legendX,
    y: legendY - 5,
    size: fontSize,
    font,
    color: rgb(0, 1, 0)
  })

  // Save the grid overlay PDF
  const outputPath = path.join(__dirname, 'hp-form-with-grid.pdf')
  const gridPdfBytes = await pdfDoc.save()
  fs.writeFileSync(outputPath, gridPdfBytes)

  console.log('✅ Coordinate grid created successfully!')
  console.log(`   Output: ${outputPath}\n`)

  console.log('='.repeat(80))
  console.log('📋 NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('1. Open hp-form-with-grid.pdf')
  console.log('2. Identify field positions using the grid')
  console.log('3. Note the X,Y coordinates for each field:')
  console.log('   - X = horizontal position (red lines)')
  console.log('   - Y = vertical position (blue lines)')
  console.log('   - Origin (0,0) is at BOTTOM-LEFT corner')
  console.log('4. Create field mapping with exact coordinates')
  console.log('='.repeat(80))
  console.log('')
  console.log('Example field positions to map:')
  console.log('- Pet Name')
  console.log('- Policy Number / Pet ID')
  console.log('- Owner Name')
  console.log('- Owner Address')
  console.log('- Owner Phone')
  console.log('- Vet Clinic Name')
  console.log('- Vet Clinic Address')
  console.log('- Vet Clinic Phone')
  console.log('- Service/Treatment Date')
  console.log('- Diagnosis/Reason for Visit')
  console.log('- Total Amount')
  console.log('- Signature area')
  console.log('- Date Signed')
  console.log('')
}

createCoordinateGrid()
  .then(() => {
    console.log('✅ Complete - check hp-form-with-grid.pdf\n')
    process.exit(0)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
