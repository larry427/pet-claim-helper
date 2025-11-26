/**
 * Setup Script: Create test user, pets, and Gmail session
 * Run once before first test execution
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GMAIL_SESSION_PATH = path.join(process.cwd(), '.playwright-mcp', 'gmail-session');
const TEST_USER_EMAIL = 'test-automation@petclaimhelper.com';
const TEST_USER_PASSWORD = 'SecureTestPass2024!';

const TEST_PETS = [
  {
    name: 'TestDog-Trupanion',
    species: 'dog',
    insurance_company: 'Trupanion',
    policy_number: 'TEST-TRUP-001'
  },
  {
    name: 'TestDog-Nationwide',
    species: 'dog',
    insurance_company: 'Nationwide',
    policy_number: 'TEST-NATION-001'
  },
  {
    name: 'TestDog-HealthyPaws',
    species: 'dog',
    insurance_company: 'Healthy Paws',
    policy_number: 'TEST-HP-001'
  }
];

async function setupTestUser() {
  console.log('\n📝 Setting up test user...');

  try {
    // Check if user exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', TEST_USER_EMAIL)
      .maybeSingle();

    if (existingProfile) {
      console.log(`✅ Test user already exists: ${TEST_USER_EMAIL}`);
      return existingProfile.id;
    }

    // Check if auth user exists
    const { data: existingAuthUser } = await supabase.auth.admin.listUsers();
    const authUser = existingAuthUser?.users?.find(u => u.email === TEST_USER_EMAIL);

    if (authUser) {
      console.log(`✅ Test user already exists: ${TEST_USER_EMAIL}`);
      return authUser.id;
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: TEST_USER_EMAIL,
        full_name: 'Test Automation User',
        is_admin: false
      });

    if (profileError && !profileError.message.includes('duplicate')) {
      throw profileError;
    }

    console.log(`✅ Created test user: ${TEST_USER_EMAIL}`);
    return userId;

  } catch (error) {
    if (error.message && error.message.includes('duplicate')) {
      console.log(`✅ Test user already exists: ${TEST_USER_EMAIL}`);
      // Fetch the existing user ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', TEST_USER_EMAIL)
        .single();
      return profile?.id;
    }
    console.error(`❌ Error creating test user: ${error.message}`);
    throw error;
  }
}

async function setupTestPets(userId) {
  console.log('\n🐕 Setting up test pets...');

  for (const petData of TEST_PETS) {
    try {
      // Check if pet exists
      const { data: existingPet } = await supabase
        .from('pets')
        .select('id, name')
        .eq('user_id', userId)
        .eq('name', petData.name)
        .single();

      if (existingPet) {
        console.log(`✅ Pet already exists: ${petData.name}`);
        continue;
      }

      // Create pet
      const { error: petError } = await supabase
        .from('pets')
        .insert({
          user_id: userId,
          name: petData.name,
          species: petData.species,
          insurance_company: petData.insurance_company,
          policy_number: petData.policy_number,
          breed: 'Test Breed',
          date_of_birth: '2020-01-01'
        });

      if (petError) throw petError;

      console.log(`✅ Created pet: ${petData.name} (${petData.insurance_company})`);

    } catch (error) {
      console.error(`❌ Error creating pet ${petData.name}: ${error.message}`);
    }
  }
}

async function setupGmailSession() {
  console.log('\n📧 Setting up Gmail session...');

  // Create session directory
  if (!fs.existsSync(GMAIL_SESSION_PATH)) {
    fs.mkdirSync(GMAIL_SESSION_PATH, { recursive: true });
  }

  // Check if session already exists
  const stateFile = path.join(GMAIL_SESSION_PATH, 'state.json');
  if (fs.existsSync(stateFile)) {
    console.log('✅ Gmail session already exists');
    console.log('   Delete .playwright-mcp/gmail-session/ to reset');
    return;
  }

  console.log('\n⚠️  AUTO-SETUP: Gmail Login');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Opening browser with 2 Gmail login pages...');
  console.log('  Tab 1: larry@uglydogadventures.com');
  console.log('  Tab 2: larry@vrexistence.com');
  console.log('\nWaiting 30 seconds for login, then auto-saving session...');

  // Launch browser with persistent context
  const browser = await chromium.launchPersistentContext(GMAIL_SESSION_PATH, {
    headless: false,
    viewport: { width: 1280, height: 720 }
  });

  // Open Gmail tabs
  const page1 = await browser.newPage();
  await page1.goto('https://mail.google.com');

  const page2 = await browser.newPage();
  await page2.goto('https://mail.google.com');

  console.log('\n✓ Browser opened with 2 Gmail tabs');
  console.log('✓ Waiting 30 seconds for manual login...');

  // Wait 30 seconds for user to complete login
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('\n💾 Auto-saving Gmail session...');

  // Close browser (context will be saved)
  await browser.close();

  console.log('✅ Gmail session saved!');
  console.log('   Future tests will auto-login using saved cookies');
}

async function createDummyVetBills() {
  console.log('\n📄 Creating dummy vet bills...');

  const vetBillsDir = path.join(process.cwd(), 'test', 'vet-bills');
  if (!fs.existsSync(vetBillsDir)) {
    fs.mkdirSync(vetBillsDir, { recursive: true });
  }

  const bills = [
    'trupanion-bill.pdf',
    'nationwide-bill.pdf',
    'healthypaws-bill.pdf'
  ];

  const dummyPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 100\n>>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(TEST VET BILL) Tj\n100 650 Td\n/F1 12 Tf\n(Service Date: 2024-11-20) Tj\n100 630 Td\n(Amount: $250.00) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000317 00000 n\ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n467\n%%EOF'
  );

  for (const bill of bills) {
    const billPath = path.join(vetBillsDir, bill);
    if (!fs.existsSync(billPath)) {
      fs.writeFileSync(billPath, dummyPdf);
      console.log(`✅ Created: ${bill}`);
    } else {
      console.log(`✅ Already exists: ${bill}`);
    }
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  TEST ENVIRONMENT SETUP               ║');
  console.log('╚═══════════════════════════════════════╝');

  try {
    // 1. Create test user
    const userId = await setupTestUser();

    // 2. Create test pets
    await setupTestPets(userId);

    // 3. Create dummy vet bills
    await createDummyVetBills();

    // 4. Setup Gmail session (manual step)
    await setupGmailSession();

    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  ✅ SETUP COMPLETE                    ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('\nYou can now run the E2E tests:');
    console.log('  npx playwright test test/e2e/claim-submission-full.spec.ts\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
