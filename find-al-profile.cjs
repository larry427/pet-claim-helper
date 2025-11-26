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
  console.log('\n=== FINDING AL IN PROFILES TABLE ===\n');

  // Try finding by phone number with Al's known number
  const phoneVariants = ['+16318334803', '6318334803', '+1-631-833-4803'];

  for (const phone of phoneVariants) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone, email, sms_opt_in')
      .eq('phone', phone)
      .maybeSingle();

    if (profile) {
      console.log(`✅ Found Al by phone ${phone}:`);
      console.log(`   ID: ${profile.id}`);
      console.log(`   Email: ${profile.email}`);
      console.log(`   Phone: ${profile.phone}`);
      console.log(`   SMS opt-in: ${profile.sms_opt_in}`);

      // Get medications
      const { data: meds } = await supabase
        .from('medications')
        .select('id, medication_name, reminder_times, start_date, end_date, pets(name)')
        .eq('user_id', profile.id);

      console.log(`\n📋 Medications: ${meds?.length || 0}`);
      if (meds && meds.length > 0) {
        meds.forEach(m => {
          console.log(`\n  ${m.medication_name} (${m.pets?.name})`);
          console.log(`    Times: ${JSON.stringify(m.reminder_times)}`);
          console.log(`    Active: ${m.start_date} to ${m.end_date || 'ongoing'}`);
        });
      }

      // Check today's logs
      const today = new Date().toISOString().split('T')[0];
      const { data: logs } = await supabase
        .from('medication_reminders_log')
        .select('*')
        .eq('user_id', profile.id)
        .eq('reminder_date', today)
        .order('sent_at', { ascending: true });

      console.log(`\n📊 Today's reminder logs (${today}): ${logs?.length || 0}`);
      if (logs && logs.length > 0) {
        logs.forEach(l => {
          const time = new Date(l.sent_at).toLocaleTimeString();
          console.log(`  - ${l.reminder_time} sent at ${time} (${l.message_id || 'no SID'})`);
        });
      }

      // Check last 5 days for duplicates
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const { data: recent } = await supabase
        .from('medication_reminders_log')
        .select('reminder_date, reminder_time, sent_at')
        .eq('user_id', profile.id)
        .gte('reminder_date', fiveDaysAgo.toISOString().split('T')[0])
        .order('sent_at', { ascending: false });

      console.log(`\n📅 Last 5 days: ${recent?.length || 0} reminders`);
      if (recent && recent.length > 0) {
        const byDateTime = recent.reduce((acc, log) => {
          const key = `${log.reminder_date} ${log.reminder_time}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(log);
          return acc;
        }, {});

        const dupes = Object.entries(byDateTime).filter(([k, v]) => v.length > 1);
        if (dupes.length > 0) {
          console.log(`\n❌ DUPLICATES DETECTED: ${dupes.length} instances`);
          dupes.forEach(([key, logs]) => {
            console.log(`  ${key}: ${logs.length} sends`);
            logs.forEach(l => console.log(`    - ${new Date(l.sent_at).toLocaleTimeString()}`));
          });
        } else {
          console.log('✅ No duplicates in last 5 days');
        }
      }

      return;
    }
  }

  console.log('❌ Could not find Al by phone number');
  console.log('\nTrying to find all profiles with sms_opt_in...');

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, phone, email, sms_opt_in')
    .eq('sms_opt_in', true)
    .limit(10);

  if (allProfiles && allProfiles.length > 0) {
    console.log(`\nFound ${allProfiles.length} profiles with SMS enabled:`);
    allProfiles.forEach(p => {
      console.log(`  - ${p.email || 'no email'} (${p.phone})`);
    });
  }
})().catch(console.error);
