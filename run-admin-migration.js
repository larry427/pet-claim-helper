// Script to add is_admin column via Supabase Admin API
// Run this with: ENV_PATH=.env.local node run-admin-migration.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.ENV_PATH });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('\n⚠️  MANUAL STEP REQUIRED ⚠️\n');
  console.log('Please run the following SQL in your Supabase SQL Editor:\n');
  console.log('='.repeat(70));
  console.log(`
-- Add is_admin column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
ON profiles(is_admin) WHERE is_admin = true;

-- Set larry@uglydogadventures.com as admin
UPDATE profiles
SET is_admin = true
WHERE email = 'larry@uglydogadventures.com';

-- Verify
SELECT email, full_name, is_admin
FROM profiles
WHERE email = 'larry@uglydogadventures.com';
  `);
  console.log('='.repeat(70));
  console.log('\nSteps:');
  console.log('1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql');
  console.log('2. Copy the SQL above');
  console.log('3. Paste and run it');
  console.log('4. Press Enter when done...\n');

  // Wait for user confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise(resolve => {
    readline.question('Have you run the SQL? (y/n) ', answer => {
      readline.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('\n❌ Migration aborted. Please run the SQL first.\n');
        process.exit(1);
      }
      resolve();
    });
  });

  // Verify the migration worked
  console.log('\n✅ Verifying migration...\n');

  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name, is_admin')
    .eq('email', 'larry@uglydogadventures.com')
    .single();

  if (error) {
    console.error('❌ Verification failed:', error.message);
    console.log('\nThe column might not be added yet. Please check Supabase.\n');
    process.exit(1);
  }

  if (data.is_admin === true) {
    console.log('✅ Migration successful!');
    console.log('\nAdmin user:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n✅ Ready to build admin dashboard!\n');
  } else {
    console.log('⚠️  Column exists but is_admin is not true');
    console.log('Please run the UPDATE statement in Supabase SQL editor.\n');
  }
}

runMigration();
