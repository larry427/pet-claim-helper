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
  console.log('\n=== RESETTING fredsmith@gmail.com FOR ONBOARDING ===\n');

  // Find user by email
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'fredsmith@gmail.com');
  
  if (!user) {
    console.log('❌ User fredsmith@gmail.com not found');
    return;
  }

  console.log('✅ Found user:', user.email);
  console.log('   User ID:', user.id);

  // Get all pets for this user
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, name')
    .eq('user_id', user.id);

  if (petsError) {
    console.error('❌ Error fetching pets:', petsError.message);
    return;
  }

  if (!pets || pets.length === 0) {
    console.log('\n✅ User already has 0 pets - onboarding will trigger');
    return;
  }

  console.log(`\nFound ${pets.length} pet(s) for this user:`);
  pets.forEach(pet => console.log(`  - ${pet.name} (${pet.id})`));

  console.log('\n🗑️  Deleting pets...');

  // Delete all pets (this will cascade to related records)
  const { error: deleteError } = await supabase
    .from('pets')
    .delete()
    .eq('user_id', user.id);

  if (deleteError) {
    console.error('❌ Error deleting pets:', deleteError.message);
    return;
  }

  console.log('✅ All pets deleted successfully');

  // Reset onboarding_complete flag
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ onboarding_complete: false })
    .eq('id', user.id);

  if (profileError) {
    console.error('❌ Error resetting onboarding flag:', profileError.message);
    return;
  }

  console.log('✅ Reset onboarding_complete flag to false');
  console.log('\n✅ User is now ready to go through onboarding again!');
  console.log('   Login with fredsmith@gmail.com to see the onboarding modal');

})().catch(console.error);
