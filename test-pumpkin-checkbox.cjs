const fs = require('fs');
const path = require('path');

async function testPumpkinPDF() {
  const { generateClaimFormPDF } = await import('./server/lib/generateClaimPDF.js');

  // Test data matching EXACT API structure
  const dummyClaimData = {
    policyholderName: 'Test User',
    policyholderPhone: '(555) 123-4567',
    policyholderEmail: 'test@example.com',
    address: '123 Test Street',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90210',
    petName: 'Fluffy',
    pumpkinAccountNumber: 'PUMP12345',
    breed: 'Golden Retriever',
    petDateOfBirth: '2020-01-15',
    claimType: 'Illness',
    vetClinicName: 'Test Animal Hospital',
    totalAmount: '250.00',
    treatmentDate: '2024-11-15',
    diagnosis: 'Test diagnosis',
    itemizedCharges: [
      { description: 'Office Visit', amount: '75.00' },
      { description: 'Blood Work', amount: '125.00' },
      { description: 'X-Ray', amount: '50.00' }
    ]
  };

  const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const dateSigned = '12/04/2024';

  console.log('Testing Pumpkin PDF with corrected checkbox coordinates...');
  console.log('Expected: X inside "No" checkbox at (516, 472)');

  const pdfBuffer = await generateClaimFormPDF('Pumpkin', dummyClaimData, dummySignature, dateSigned);

  const outputPath = path.join(__dirname, 'test-pumpkin-checkbox-fixed.pdf');
  fs.writeFileSync(outputPath, pdfBuffer);

  console.log(`\n✅ PDF generated: ${outputPath}`);
  console.log('\nVerify on page 2:');
  console.log('1. "Date illness/injury first occurred" shows: 11/15/2024');
  console.log('2. "No" checkbox has X INSIDE the box (not to the right)');
  console.log('3. Diagnosis shows: Office Visit, Blood Work, X-Ray');
}

testPumpkinPDF().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
