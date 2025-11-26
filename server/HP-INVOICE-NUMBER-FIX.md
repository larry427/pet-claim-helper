# Healthy Paws Invoice Number & Pet ID Fix

## Problem
Invoice number and HP Pet ID fields were blank on Healthy Paws claim form PDFs, even though the data existed in the database.

## Root Cause Analysis

### Invoice Number Missing
**Location**: `server/index.js` lines 1317-1346 (submit) and 1537-1565 (preview)

The `claimData` object passed to PDF generation was missing the `invoiceNumber` field.

**Evidence**:
- Mapping exists: `lib/claimFormMappings.js:68` - `invoiceNumber: { x: 175, y: 405, size: 10 }`
- PDF generator expects it: `server/lib/generateClaimPDF.js:462` - `invoiceNumber: claimData.invoiceNumber`
- Database has it: Claims table has `invoice_number` column
- **BUT** claimData object didn't include it!

### HP Pet ID Missing  
**Location**: Same as above

The `claimData` object was also missing `healthyPawsPetId` field.

**Evidence**:
- Mapping exists: `lib/claimFormMappings.js:63` - `healthyPawsPetId: { x: 500, y: 500, size: 10 }`
- PDF generator expects it: `server/lib/generateClaimPDF.js:459` - `healthyPawsPetId: claimData.healthyPawsPetId`
- Database has it: Pets table has `healthy_paws_pet_id` column (added in previous fix)
- **BUT** claimData object didn't include it!

## Fix Applied

### Submit Endpoint (line 1339-1340, 1323)
```javascript
healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
invoiceNumber: claim.invoice_number || '',  // Invoice/receipt number for HP and other insurers
```

### Preview Endpoint (line 1557-1558, 1545)
```javascript
healthyPawsPetId: claim.pets.healthy_paws_pet_id || '',  // For Healthy Paws form
invoiceNumber: claim.invoice_number || '',  // Invoice/receipt number for HP and other insurers
```

## Data Flow

1. **Database**: Claims table stores `invoice_number`, Pets table stores `healthy_paws_pet_id`
2. **Endpoint**: Fetches claim and pet data from database
3. **claimData Object**: NOW includes both `invoiceNumber` and `healthyPawsPetId` ✅
4. **PDF Generator**: `getValueForField()` maps these to coordinate-based text overlay
5. **Output**: Invoice number appears at (175, 405), Pet ID appears at (500, 500)

## Testing

After deployment, preview a Healthy Paws claim:
1. Should show invoice number (e.g., "INV-12345") in "Invoice Number" field
2. Should show Pet ID (e.g., "1400806-1") in "Pet Id" field

## Deployment Status

✅ Backend deployed to Render (commit b12ae28d)

## Files Changed

- `server/index.js` - Added `invoiceNumber` and `healthyPawsPetId` to both claimData objects
