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
  console.log('\n=== CHECKING AL\'S MEDICATION SETUP ===\n');

  // Find users with 'al' in email
  const { data: users } = await supabase
    .from('users')
    .select('id, phone, email')
    .ilike('email', '%al%')
    .limit(5);

  if (!users || users.length === 0) {
    console.log('❌ No users found with "al" in email');
    return;
  }

  console.log('Found users:');
  users.forEach(u => console.log(`  - ${u.email} (${u.phone})`));

  const alUser = users[0];
  console.log(`\nUsing: ${alUser.email}\n`);

  const { data: meds } = await supabase
    .from('medications')
    .select('id, medication_name, reminder_times, start_date, end_date, user_id, pets(name), profiles(phone, sms_opt_in)')
    .eq('user_id', alUser.id);

  console.log(`Medications: ${meds?.length || 0}`);
  if (meds && meds.length > 0) {
    meds.forEach(m => {
      console.log(`\n  ${m.medication_name}`);
      console.log(`    Pet: ${m.pets?.name || 'Unknown'}`);
      console.log(`    Times: ${JSON.stringify(m.reminder_times)}`);
      console.log(`    Dates: ${m.start_date} to ${m.end_date || 'ongoing'}`);
      console.log(`    Phone: ${m.profiles?.phone}`);
      console.log(`    SMS opt-in: ${m.profiles?.sms_opt_in}`);
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: todayLogs } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('user_id', alUser.id)
    .eq('reminder_date', today)
    .order('reminder_time', { ascending: true });

  console.log(`\n📋 Today's logs (${today}): ${todayLogs?.length || 0}`);
  if (todayLogs && todayLogs.length > 0) {
    todayLogs.forEach(l => {
      console.log(`  - ${l.reminder_time}: ${l.message_id || 'no SID'}`);
    });
  }

  // Check last 7 days for duplicates
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekLogs } = await supabase
    .from('medication_reminders_log')
    .select('reminder_date, reminder_time, medication_id')
    .eq('user_id', alUser.id)
    .gte('reminder_date', weekAgo.toISOString().split('T')[0])
    .order('reminder_date', { ascending: false });

  console.log(`\n📊 Last 7 days logs: ${weekLogs?.length || 0}`);

  if (weekLogs && weekLogs.length > 0) {
    const grouped = weekLogs.reduce((acc, log) => {
      const key = `${log.reminder_date} ${log.reminder_time}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    const dupes = Object.entries(grouped).filter(([k, v]) => v.length > 1);
    if (dupes.length > 0) {
      console.log(`\n❌ DUPLICATES FOUND: ${dupes.length}`);
      dupes.forEach(([key, logs]) => {
        console.log(`  ${key}: ${logs.length} reminders`);
      });
    } else {
      console.log('✅ No duplicates in last 7 days');
    }
  }
})().catch(console.error);
