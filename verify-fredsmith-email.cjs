const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('server/.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  envVars.SUPABASE_URL || envVars.VITE_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('\n=== VERIFYING EMAIL FOR fredsmith@gmail.com ===\n');

  // Find user by email
  const { data: users, error: fetchError } = await supabase.auth.admin.listUsers();
  
  if (fetchError) {
    console.error('❌ Error fetching users:', fetchError.message);
    return;
  }

  const user = users.users.find(u => u.email === 'fredsmith@gmail.com');
  
  if (!user) {
    console.log('❌ User fredsmith@gmail.com not found');
    console.log('\nAvailable users:');
    users.users.forEach(u => console.log(`  - ${u.email} (${u.id})`));
    return;
  }

  console.log('✅ Found user:', user.email);
  console.log('   User ID:', user.id);
  console.log('   Email confirmed:', user.email_confirmed_at ? 'YES' : 'NO');

  if (user.email_confirmed_at) {
    console.log('\n✅ Email already verified!');
    return;
  }

  // Verify email
  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { email_confirm: true }
  );

  if (updateError) {
    console.error('❌ Error verifying email:', updateError.message);
    return;
  }

  console.log('\n✅ Email verified successfully!');
  console.log('   User can now log in');

})().catch(console.error);
