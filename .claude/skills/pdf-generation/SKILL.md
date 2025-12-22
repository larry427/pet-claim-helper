# PDF Claim Form Generation Skill

## Name
PDF Claim Form Generation

## Description
Use this skill when working with PDF claim form generation, debugging field mapping issues, fixing signature placement, or adding support for new PDF form types.

---

## PDF Generation Flow

```
1. User clicks Auto-Submit or Preview PDF
2. Frontend sends claim data to /api/claims/generate-pdf
3. Backend loads appropriate PDF template
4. generateClaimPDF() fills fields using claimData
5. Signature is added (coordinate-based or fillable field)
6. PDF is returned/emailed
```

---

## Key Files

| File | Purpose |
|------|---------|
| `server/lib/generateClaimPDF.js` | Main PDF generation logic |
| `server/lib/claimFormMappings.js` | Field mappings & required fields |
| `server/claim-forms/*.pdf` | PDF templates |

---

## PDF Form Types

### Type 1: Fillable PDF Fields
- Standard form fields (PDFTextField, PDFCheckBox)
- Fill using `form.getTextField('fieldName').setText(value)`
- Used by: Nationwide, Trupanion

### Type 2: Coordinate-Based (Flat PDF)
- No fillable fields, text placed by coordinates
- Fill using `page.drawText(value, { x, y, size })`
- Used by: Healthy Paws (Option B)

### Type 3: PDFfiller Signature Widget
- Mix of fillable fields + signature as annotation
- Signature placed using widget coordinates extraction
- Used by: Figo, Pets Best, ASPCA

---

## Field Mapping Structure

In `FORM_FIELD_MAPPINGS`:

```javascript
'{insurer}': {
  policyholderName: 'PDF_Field_Name_1',  // Maps claimData.policyholderName → PDF field
  policyNumber: 'PDF_Field_Name_2',
  // ... etc
}
```

**The key is the claimData property, the value is the PDF field name.**

---

## getValueForField() Function

This function returns the value for each claimData property:

```javascript
const fieldMap = {
  policyholderName: claimData.policyholderName || '',
  policyNumber: claimData.policyNumber || '',
  cityStateZip: `${claimData.city}, ${claimData.state} ${claimData.zip}`.trim(),
  // Common fields work for all insurers

  // Insurer-specific fields if needed (rare)
}
```

**WARNING:** Don't use conditional spreads with outer-scope variables:
```javascript
// WRONG - normalizedInsurer not in scope:
...(normalizedInsurer.includes('aspca') && { customField: value })

// RIGHT - just define it, mapping controls usage:
customField: claimData.customField || ''
```

---

## Adding New PDF Form

### Step 1: Inspect PDF Fields

```javascript
cd server && node -e "
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
async function inspect() {
  const pdfBytes = fs.readFileSync('claim-forms/{insurer}_claim_form.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateFieldAppearances: false });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  console.log('Total fields:', fields.length);
  fields.forEach((f, i) => {
    const type = f.constructor.name;
    const name = f.getName();
    console.log(\`\${i+1}. \${name} (\${type})\`);
    if (type === 'PDFTextField') {
      // Get position for reference
      const widgets = f.acroField.getWidgets();
      if (widgets.length > 0) {
        const rect = widgets[0].getRectangle();
        console.log(\`   Position: x=\${rect.x}, y=\${rect.y}\`);
      }
    }
  });
}
inspect();
"
```

### Step 2: Create Field Mapping

Map each PDF field to the corresponding claimData property:

```javascript
'{insurer}': {
  policyholderName: 'Name_1',
  policyNumber: 'Account_Number',
  // etc.
}
```

### Step 3: Verify Visual vs Field Order

**PDFfiller auto-generated names (Text_1, Number_1) often don't match visual order!**

Test with real data and verify each field shows correct value.

---

## Signature Handling

### PDFfiller Signature Widget

These use `PDFSignature` type which requires special handling:

```javascript
// Extract widget coordinates
const widgets = signatureField.acroField.getWidgets();
if (widgets.length > 0) {
  const rect = widgets[0].getRectangle();
  // Draw signature image at these coordinates
  page.drawImage(signatureImage, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  });
}
```

### Standard Signature Field

Some forms have regular text field for signature:
```javascript
form.getTextField('Signature').setText(policyholderName);
```

---

## Common Field Adjustments

### Font Size for Long Values

```javascript
if (pdfFieldName === 'Email_1') {
  textField.setFontSize(8);  // Smaller font for long emails
}
```

### Currency Prefix

```javascript
if (pdfFieldName === 'USD_1' && !finalValue.startsWith('$')) {
  finalValue = '$' + finalValue;
}
```

### Combined City/State/Zip

```javascript
cityStateZip: `${claimData.city || ''}, ${claimData.state || ''} ${claimData.zip || ''}`.trim()
```

### Date Formatting

```javascript
signatureDate: claimData.signatureDate || new Date().toLocaleDateString('en-US')
// Output: "12/22/2025"
```

---

## Debugging PDF Issues

### Wrong Field Shows Wrong Data

**Likely cause:** Field mapping is swapped

1. Print all field values:
```javascript
console.log('PDF Field Mapping Debug:');
Object.entries(mapping).forEach(([key, pdfField]) => {
  const value = getValueForField(key, claimData, insurer);
  console.log(`  ${key} → ${pdfField}: "${value}"`);
});
```

2. Swap the mapping values in `FORM_FIELD_MAPPINGS`

### Field is Blank

1. Check if field exists in mapping
2. Check if claimData has the value:
```javascript
console.log('claimData:', JSON.stringify(claimData, null, 2));
```
3. Check if getValueForField() returns it
4. Check if PDF field name matches exactly

### Signature Not Appearing

1. Check signature field type (`PDFSignature` vs `PDFTextField`)
2. For PDFSignature, verify widget coordinate extraction
3. Check if signature image was created from base64

### PDF Looks Correct but Wrong Data

Check the full pipeline:
1. Frontend sending correct data?
2. API receiving it?
3. claimData object has it?
4. getValueForField() returns it?
5. Mapping points to correct PDF field?

---

## Debug Logging Pattern

Add temporary logging for specific insurer:

```javascript
if (normalizedInsurer.includes('{insurer}')) {
  console.log(`\n${'🔍'.repeat(40)}`);
  console.log(`🔍 {INSURER} PDF DEBUG:`);
  console.log(`  policyholderName: "${claimData.policyholderName}"`);
  console.log(`  policyNumber: "${claimData.policyNumber}"`);
  console.log(`  petName: "${claimData.petName}"`);
  console.log(`  breed: "${claimData.breed}"`);
  console.log(`  age: "${claimData.age}"`);
  console.log(`  gender: "${claimData.gender}"`);
  console.log(`${'🔍'.repeat(40)}\n`);
}
```

---

## Form-Specific Notes

### Pumpkin
- Uses fillable PDF fields
- Deadline: 270 days (not default 90)
- Account number field: `pumpkin_account_number`

### Spot
- Uses fillable PDF fields
- Account number field: `spot_account_number`

### Healthy Paws
- Option A: Fillable fields
- Option B: Coordinate-based flat PDF
- Field: `healthy_paws_pet_id`

### ASPCA
- PDFfiller signature widget
- Fields named Text_1, Number_1, etc. (verify mapping!)
- Email needs font size 8

### Figo / Pets Best
- PDFfiller signature widget
- Similar structure to ASPCA
