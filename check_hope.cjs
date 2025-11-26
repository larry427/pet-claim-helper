const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://cchmsrpvmwuzikwjdutv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjaG1zcnB2bXd1emlrd2pkdXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0NjU5NTQsImV4cCI6MjA1MjA0MTk1NH0.3X3Xuu1lv-30pLAR4IDhJHT-bpVlU0JaKHe1PQPbRWA'
);

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
