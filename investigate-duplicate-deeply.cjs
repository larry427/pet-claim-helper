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
const JAEGER_PET_ID = '2fc0d2ce-b2ef-4f13-ad0c-ef271728a127';

(async () => {
  console.log('\n=== DEEP INVESTIGATION: WHY 2 TEXTS BUT 1 LOG? ===\n');

  // 1. Get ALL medications for Jaeger (including ended ones)
  console.log('1. ALL MEDICATIONS FOR JAEGER (including ended):');
  console.log('================================================\n');

  const { data: allMeds } = await supabase
    .from('medications')
    .select('*')
    .eq('pet_id', JAEGER_PET_ID)
    .order('created_at', { ascending: true });

  if (!allMeds || allMeds.length === 0) {
    console.log('❌ No medications found for Jaeger');
    return;
  }

  console.log(`Found ${allMeds.length} medication entries:\n`);
  allMeds.forEach((med, i) => {
    console.log(`${i + 1}. ${med.medication_name} (ID: ${med.id.substring(0, 8)}...)`);
    console.log(`   Created: ${med.created_at}`);
    console.log(`   Start: ${med.start_date}, End: ${med.end_date || 'ongoing'}`);
    console.log(`   Reminder times: ${JSON.stringify(med.reminder_times)}`);
    console.log(`   User ID: ${med.user_id}`);

    // Check if active TODAY
    const today = '2025-11-25';
    const isActive = med.start_date <= today && (!med.end_date || med.end_date >= today);
    console.log(`   Status on ${today}: ${isActive ? '✅ ACTIVE' : '❌ INACTIVE'}\n`);
  });

  // Count how many are active with 08:00 reminder
  const activeMedsAt8am = allMeds.filter(med => {
    const today = '2025-11-25';
    const isActive = med.start_date <= today && (!med.end_date || med.end_date >= today);
    const has8am = med.reminder_times?.includes('08:00');
    return isActive && has8am;
  });

  console.log(`\n⚠️  ACTIVE MEDICATIONS WITH 08:00 REMINDER TODAY: ${activeMedsAt8am.length}`);
  if (activeMedsAt8am.length > 1) {
    console.log('🚨 THIS IS THE PROBLEM! Multiple active medications at same time:\n');
    activeMedsAt8am.forEach((med, i) => {
      console.log(`   ${i + 1}. ${med.medication_name} (${med.id.substring(0, 8)}...)`);
    });
  }

  // 2. Check ALL log entries for today (not just Al's)
  console.log('\n\n2. ALL LOG ENTRIES FOR TODAY (2025-11-25):');
  console.log('==========================================\n');

  const { data: todayLogs } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('reminder_date', '2025-11-25')
    .eq('user_id', AL_USER_ID)
    .order('created_at', { ascending: true });

  console.log(`Total log entries for Al today: ${todayLogs?.length || 0}\n`);

  if (todayLogs && todayLogs.length > 0) {
    todayLogs.forEach((log, i) => {
      const med = allMeds.find(m => m.id === log.medication_id);
      console.log(`${i + 1}. ${med?.medication_name || 'Unknown'}`);
      console.log(`   Medication ID: ${log.medication_id}`);
      console.log(`   Reminder time: ${log.reminder_time}`);
      console.log(`   Sent at: ${log.sent_at}`);
      console.log(`   Created at: ${log.created_at}`);
      console.log(`   Message SID: ${log.message_id}\n`);
    });
  }

  // 3. Check if there are duplicate medication_id + reminder_time entries
  console.log('\n3. CHECKING FOR DUPLICATE LOGGING ATTEMPTS:');
  console.log('============================================\n');

  if (todayLogs && todayLogs.length > 0) {
    const grouped = todayLogs.reduce((acc, log) => {
      const key = `${log.medication_id}-${log.reminder_time}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    const dupes = Object.entries(grouped).filter(([k, v]) => v.length > 1);
    if (dupes.length > 0) {
      console.log('🚨 DUPLICATE LOGS FOUND:\n');
      dupes.forEach(([key, logs]) => {
        console.log(`${key}: ${logs.length} log entries`);
        logs.forEach((l, i) => {
          console.log(`  ${i + 1}. Created: ${l.created_at}, SID: ${l.message_id}`);
        });
      });
    } else {
      console.log('✅ No duplicate log entries for same medication + time');
    }
  }

  // 4. Check medication_doses table for today
  console.log('\n\n4. CHECKING MEDICATION_DOSES TABLE:');
  console.log('====================================\n');

  const { data: doses } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('user_id', AL_USER_ID)
    .gte('scheduled_time', '2025-11-25T00:00:00')
    .lte('scheduled_time', '2025-11-25T23:59:59')
    .order('created_at', { ascending: true });

  console.log(`Dose records created today: ${doses?.length || 0}\n`);

  if (doses && doses.length > 0) {
    doses.forEach((dose, i) => {
      const med = allMeds.find(m => m.id === dose.medication_id);
      console.log(`${i + 1}. ${med?.medication_name || 'Unknown'}`);
      console.log(`   Dose ID: ${dose.id}`);
      console.log(`   Medication ID: ${dose.medication_id}`);
      console.log(`   Scheduled time: ${dose.scheduled_time}`);
      console.log(`   Created at: ${dose.created_at}`);
      console.log(`   Status: ${dose.status}\n`);
    });

    // Check for duplicate dose creation
    const dosesByMed = doses.reduce((acc, dose) => {
      const key = dose.medication_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(dose);
      return acc;
    }, {});

    const dupeDoses = Object.entries(dosesByMed).filter(([k, v]) => v.length > 1);
    if (dupeDoses.length > 0) {
      console.log('🚨 DUPLICATE DOSES CREATED:\n');
      dupeDoses.forEach(([medId, doses]) => {
        const med = allMeds.find(m => m.id === medId);
        console.log(`${med?.medication_name || 'Unknown'}: ${doses.length} doses`);
        doses.forEach((d, i) => {
          console.log(`  ${i + 1}. Created: ${d.created_at}`);
        });
      });
    }
  }

  // 5. THEORY: Check if both medications triggered at 8:00 AM
  console.log('\n\n5. ROOT CAUSE ANALYSIS:');
  console.log('=======================\n');

  console.log(`Active medications at 08:00: ${activeMedsAt8am.length}`);
  console.log(`Log entries today: ${todayLogs?.length || 0}`);
  console.log(`Dose records created: ${doses?.length || 0}\n`);

  if (activeMedsAt8am.length === 2 && (todayLogs?.length || 0) === 1) {
    console.log('🚨 ROOT CAUSE IDENTIFIED:\n');
    console.log('TWO active medications with 08:00 reminder');
    console.log('But only ONE log entry was created');
    console.log('\nPOSSIBLE SCENARIOS:');
    console.log('1. First medication sent SMS + logged successfully');
    console.log('2. Second medication sent SMS but logging FAILED (constraint violation?)');
    console.log('3. UNIQUE constraint on (medication_id, reminder_date, reminder_time)');
    console.log('   prevented second log, but SMS was already sent\n');

    console.log('THE BUG:');
    console.log('The code sends SMS BEFORE checking the log!');
    console.log('If log insert fails, SMS is already sent and user gets duplicate.\n');
  } else if (activeMedsAt8am.length === 1 && (todayLogs?.length || 0) === 1) {
    console.log('⚠️  Only 1 active medication, 1 log entry');
    console.log('Need to check if Twilio sent duplicate on their end');
    console.log('Or if two separate cron runs triggered simultaneously\n');
  }

  // 6. Check the UNIQUE constraint
  console.log('\n6. CHECKING DATABASE CONSTRAINT:');
  console.log('=================================\n');

  console.log('The medication_reminders_log table has UNIQUE constraint:');
  console.log('UNIQUE(medication_id, reminder_date, reminder_time)\n');
  console.log('This prevents duplicate LOG entries, but...');
  console.log('If SMS is sent BEFORE log insert, and insert fails,');
  console.log('the user still receives the SMS!\n');

})().catch(console.error);
