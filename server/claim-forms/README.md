# Official Insurance Company Claim Forms

## Required Files

Place the downloaded official claim form PDFs in this directory with these exact filenames:

1. **nationwide-claim-form.pdf**
   - Download from: https://www.petinsurance.com/images/VSSimages/media/pdf/Claim_form.pdf
   - Or search "Nationwide pet insurance claim form PDF"

2. **healthypaws-claim-form.pdf**
   - Download from: https://www.healthypawspetinsurance.com/PolicyDocuments/Healthy%20Paws%20Pet%20Insurance%20Claim%20Form.pdf
   - Or search "Healthy Paws claim form PDF"

3. **trupanion-claim-form.pdf**
   - Download from: https://www.trupanion.com/docs/trupanionwebsitelibraries/trupanion/files/pdfs/claim_form.pdf
   - Or search "Trupanion claim form PDF"

## After Placing Files

Once all 3 PDFs are in this directory, run:

```bash
node server/scripts/inspectPdfFields.js
```

This will analyze each form and show all fillable field names, which we'll use to map our data to the official forms.

## Expected Directory Structure

```
server/claim-forms/
├── README.md (this file)
├── nationwide-claim-form.pdf
├── healthypaws-claim-form.pdf
└── trupanion-claim-form.pdf
```
