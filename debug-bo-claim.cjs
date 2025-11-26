const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('INVESTIGATION: VET BILL PDF NOT ATTACHED TO BO\'S CLAIM');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Find Bo's most recent claim
  const { data: bo, error: boError } = await supabase
    .from('pets')
    .select('id, name, insurance_company')
    .eq('name', 'Bo')
    .single();

  if (boError || !bo) {
    console.error('❌ Error finding Bo:', boError);
    return;
  }

  console.log('🐕 BO FOUND:');
  console.log('   Pet ID:', bo.id);
  console.log('   Insurance:', bo.insurance_company);
  console.log('');

  // 2. Get Bo's most recent claims
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('id, pet_id, pdf_path, created_at, clinic_name, total_amount, filing_status')
    .eq('pet_id', bo.id)
    .order('created_at', { ascending: false })
    .limit(3);

  if (claimsError) {
    console.error('❌ Error querying claims:', claimsError);
    return;
  }

  console.log('📋 BO\'S RECENT CLAIMS:');
  console.log('');
  claims.forEach((claim, idx) => {
    console.log(`   CLAIM #${idx + 1}:`);
    console.log('   ID:', claim.id);
    console.log('   Created:', new Date(claim.created_at).toLocaleString());
    console.log('   Clinic:', claim.clinic_name);
    console.log('   Amount:', claim.total_amount);
    console.log('   Status:', claim.filing_status);
    console.log('   PDF Path:', claim.pdf_path || '❌ NULL (NO VET BILL!)');
    console.log('');
  });

  if (claims.length === 0) {
    console.log('   No claims found for Bo');
    return;
  }

  const latestClaim = claims[0];
  const createdAt = new Date(latestClaim.created_at);
  const now = new Date();
  const ageMinutes = Math.floor((now - createdAt) / 1000 / 60);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Latest claim created:', createdAt.toLocaleString());
  console.log('Claim age:', ageMinutes, 'minutes ago');
  console.log('');

  if (ageMinutes > 30) {
    console.log('⚠️  WARNING: This claim is MORE than 30 minutes old!');
    console.log('   The fix was likely deployed AFTER this claim was created.');
    console.log('   This is an OLD claim that never had the PDF uploaded.');
    console.log('');
    console.log('✅ SOLUTION: Create a NEW claim to test the fix!');
  } else {
    console.log('🆕 This is a RECENT claim (less than 30 min old)');
    if (!latestClaim.pdf_path) {
      console.log('❌ BUT pdf_path is NULL - the uploadClaimPdf did NOT work!');
      console.log('   Need to check frontend logs and selectedFile state.');
    } else {
      console.log('✅ pdf_path is populated, but something went wrong during submission');
    }
  }

  console.log('');
}

investigate();
