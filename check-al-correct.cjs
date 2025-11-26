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

const AL_USER_ID = '83a24640-6871-43ca-84f1-472ffc613240';
const AL_PHONE = '+17143421731';

(async () => {
  console.log('\n=== CHECKING AL\'S DUPLICATE SMS ISSUE ===\n');
  console.log(`User ID: ${AL_USER_ID}`);
  console.log(`Phone: ${AL_PHONE}\n`);

  // 1. Verify Al's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, phone, email, sms_opt_in')
    .eq('id', AL_USER_ID)
    .single();

  if (!profile) {
    console.log('❌ Profile not found');
    return;
  }

  console.log('✅ Profile found:');
  console.log(`   Email: ${profile.email}`);
  console.log(`   Phone: ${profile.phone}`);
  console.log(`   SMS opt-in: ${profile.sms_opt_in}\n`);

  // 2. Get Al's medications
  const { data: meds } = await supabase
    .from('medications')
    .select('id, medication_name, reminder_times, start_date, end_date, pets(name)')
    .eq('user_id', AL_USER_ID);

  console.log(`📋 Medications: ${meds?.length || 0}`);
  if (meds && meds.length > 0) {
    meds.forEach(m => {
      console.log(`\n  ${m.medication_name} (${m.pets?.name})`);
      console.log(`    ID: ${m.id}`);
      console.log(`    Times: ${JSON.stringify(m.reminder_times)}`);
      console.log(`    Active: ${m.start_date} to ${m.end_date || 'ongoing'}`);
    });
  }

  // 3. Check today's reminder logs (Nov 25, 2025)
  console.log('\n\n=== TODAY\'S REMINDER LOGS (2025-11-25) ===\n');

  const { data: todayLogs } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('user_id', AL_USER_ID)
    .eq('reminder_date', '2025-11-25')
    .order('created_at', { ascending: true });

  console.log(`Total logs today: ${todayLogs?.length || 0}\n`);

  if (todayLogs && todayLogs.length > 0) {
    todayLogs.forEach((log, i) => {
      console.log(`${i + 1}. Medication ID: ${log.medication_id}`);
      console.log(`   Reminder time: ${log.reminder_time}`);
      console.log(`   Sent at: ${log.sent_at}`);
      console.log(`   Created at: ${log.created_at}`);
      console.log(`   Message ID: ${log.message_id || 'none'}\n`);
    });

    // Check for duplicates at 8:00 AM
    const eightAMLogs = todayLogs.filter(log => log.reminder_time === '08:00');
    console.log(`\n📊 8:00 AM reminders: ${eightAMLogs.length}`);

    if (eightAMLogs.length > 2) {
      console.log('❌ DUPLICATES DETECTED! Expected 2 (Apoquel + Antigens), found:', eightAMLogs.length);
      console.log('\nDuplicate details:');
      eightAMLogs.forEach((log, i) => {
        console.log(`  ${i + 1}. Sent at ${new Date(log.sent_at).toLocaleTimeString()}`);
      });
    } else if (eightAMLogs.length === 2) {
      console.log('✅ No duplicates - exactly 2 reminders as expected');
      console.log('\nSent times:');
      eightAMLogs.forEach((log, i) => {
        const medName = meds?.find(m => m.id === log.medication_id)?.medication_name || 'Unknown';
        console.log(`  ${i + 1}. ${medName}: ${new Date(log.sent_at).toLocaleTimeString()}`);
      });
    } else {
      console.log(`⚠️  Expected 2, found ${eightAMLogs.length}`);
    }
  } else {
    console.log('⚠️  No logs found for today - maybe no reminders sent yet?');
  }

  // 4. Check last 7 days for duplicate pattern
  console.log('\n\n=== LAST 7 DAYS ANALYSIS ===\n');

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weekLogs } = await supabase
    .from('medication_reminders_log')
    .select('reminder_date, reminder_time, medication_id, sent_at')
    .eq('user_id', AL_USER_ID)
    .gte('reminder_date', weekAgo.toISOString().split('T')[0])
    .order('reminder_date', { ascending: false })
    .order('reminder_time', { ascending: true });

  console.log(`Total logs last 7 days: ${weekLogs?.length || 0}\n`);

  if (weekLogs && weekLogs.length > 0) {
    // Group by date and time
    const grouped = weekLogs.reduce((acc, log) => {
      const key = `${log.reminder_date} ${log.reminder_time}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    console.log('Breakdown by date/time:');
    Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([dateTime, logs]) => {
        const count = logs.length;
        const status = count > 2 ? '❌ DUPLICATE' : count === 2 ? '✅' : '⚠️ ';
        console.log(`  ${status} ${dateTime}: ${count} reminder(s)`);
        if (count > 2) {
          logs.forEach((l, i) => {
            console.log(`      ${i + 1}. ${new Date(l.sent_at).toLocaleTimeString()}`);
          });
        }
      });

    // Summary
    const duplicateDates = Object.entries(grouped).filter(([k, v]) => v.length > 2);
    if (duplicateDates.length > 0) {
      console.log(`\n🚨 DUPLICATES FOUND: ${duplicateDates.length} date/time slots with >2 reminders`);
    } else {
      console.log('\n✅ No duplicates in last 7 days - fix is working!');
    }
  }

  // 5. Check if medications have correct reminder times
  console.log('\n\n=== MEDICATION CONFIGURATION CHECK ===\n');

  if (meds && meds.length > 0) {
    meds.forEach(m => {
      const times = m.reminder_times || [];
      const has8am = times.includes('08:00');
      console.log(`${m.medication_name}:`);
      console.log(`  Reminder times: ${JSON.stringify(times)}`);
      console.log(`  Has 8:00 AM: ${has8am ? '✅' : '❌'}`);
    });
  }

})().catch(console.error);
