const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase
    .from('pets')
    .select('name, date_of_birth, adoption_date, spay_neuter_status, spay_neuter_date')
    .eq('name', 'Hope')
    .single();
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log('\n🔍 Hope Database Values:');
  console.log('========================');
  console.log('name:', data.name);
  console.log('date_of_birth:', data.date_of_birth, '(type:', typeof data.date_of_birth + ')');
  console.log('adoption_date:', data.adoption_date, '(type:', typeof data.adoption_date + ')');
  console.log('spay_neuter_status:', data.spay_neuter_status);
  console.log('spay_neuter_date:', data.spay_neuter_date, '(type:', typeof data.spay_neuter_date + ')');
  console.log('========================\n');
  process.exit(0);
})();
