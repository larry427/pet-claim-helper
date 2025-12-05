const fs = require('fs');
const path = require('path');

// Dynamic import wrapper for ESM modules
async function testPumpkinPDF() {
  // Import the ESM module
  const { generateClaimFormPDF } = await import('./server/lib/generateClaimPDF.js');

  // Create dummy claim data with all required fields
  const dummyClaimData = {
    // Policyholder info
    policyholderName: 'Test User',
    policyholderPhone: '(555) 123-4567',
    policyholderEmail: 'test@example.com',
    address: '123 Test Street',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90210',

    // Pet info
    petName: 'Fluffy',
    pumpkinAccountNumber: 'PUMP12345',
    breed: 'Golden Retriever',
    petDateOfBirth: '2020-01-15',

    // Claim info
    claimType: 'Illness',
    veterinaryClinic: 'Test Animal Hospital',
    totalAmount: '250.00',
    service_date: '2024-11-15',  // THIS IS THE KEY FIELD FOR dateIllnessOccurred
    treatmentDate: '2024-11-15',
    diagnosis: 'Test diagnosis',

    // Line items for diagnosis auto-generation
    itemizedCharges: [
      { description: 'Office Visit', amount: '75.00' },
      { description: 'Blood Work', amount: '125.00' },
      { description: 'X-Ray', amount: '50.00' }
    ]
  };

  const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const dateSigned = '12/04/2024';

  console.log('Generating Pumpkin test PDF...');
  console.log('service_date:', dummyClaimData.service_date);
  console.log('claimType:', dummyClaimData.claimType);

  const pdfBuffer = await generateClaimFormPDF('Pumpkin', dummyClaimData, dummySignature, dateSigned);

  const outputPath = path.join(__dirname, 'test-pumpkin-output.pdf');
  fs.writeFileSync(outputPath, pdfBuffer);

  console.log(`\n✅ PDF generated: ${outputPath}`);
  console.log('\nNow open the PDF and verify:');
  console.log('1. Page 2 - "Date illness/injury first occurred" shows: 11/15/2024');
  console.log('2. Page 2 - "No" checkbox for estimate question has an X');
  console.log('3. Page 2 - Diagnosis shows: Office Visit, Blood Work, X-Ray');
}

testPumpkinPDF().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
