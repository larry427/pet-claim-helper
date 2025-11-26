// Check if medication_reminders_log table exists in production and has data
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, 'server', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL;
const SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in server/.env.local');
  console.log('SUPABASE_URL:', SUPABASE_URL ? 'Found' : 'Missing');
  console.log('SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? 'Found' : 'Missing');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkProductionDB() {
  console.log('\n=== CHECKING PRODUCTION SUPABASE ===\n');

  // 1. Check if medication_reminders_log table exists
  console.log('1. Checking if medication_reminders_log table exists...');
  const { data: tables, error: tablesError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .limit(1);

  if (tablesError) {
    console.error('❌ Table does NOT exist or error:', tablesError.message);
    console.log('\n🚨 FIX NOT DEPLOYED - Table missing!\n');
    return;
  }
  console.log('✅ Table exists\n');

  // 2. Check for today's entries
  console.log('2. Checking for today\'s reminder log entries (2025-11-25)...');
  const { data: todayLogs, error: logsError } = await supabase
    .from('medication_reminders_log')
    .select('*')
    .eq('reminder_date', '2025-11-25')
    .order('sent_at', { ascending: false });

  if (logsError) {
    console.error('❌ Error querying logs:', logsError.message);
  } else if (!todayLogs || todayLogs.length === 0) {
    console.log('⚠️  No entries for today (2025-11-25)');
    console.log('Either no reminders sent yet today, or fix not running\n');
  } else {
    console.log(`✅ Found ${todayLogs.length} log entries for today:`);
    todayLogs.forEach(log => {
      console.log(`   - Med ID: ${log.medication_id}, User: ${log.user_id}, Sent: ${log.sent_at}`);
    });
    console.log();
  }

  // 3. Check for recent duplicates (since Nov 20)
  console.log('3. Checking for duplicate reminders sent since Nov 20...');
  const { data: recentLogs, error: recentError } = await supabase
    .from('medication_reminders_log')
    .select('medication_id, user_id, reminder_date, sent_at')
    .gte('reminder_date', '2025-11-20')
    .order('medication_id', { ascending: true })
    .order('reminder_date', { ascending: true })
    .order('sent_at', { ascending: true });

  if (!recentError && recentLogs) {
    console.log(`Total logs since Nov 20: ${recentLogs.length}`);
    
    const grouped = recentLogs.reduce((acc, log) => {
      const key = `${log.medication_id}-${log.reminder_date}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    const duplicates = Object.entries(grouped).filter(([key, logs]) => logs.length > 1);
    if (duplicates.length > 0) {
      console.log(`\n❌ Found ${duplicates.length} duplicate reminder dates since Nov 20:`);
      duplicates.forEach(([key, logs]) => {
        const times = logs.map(l => new Date(l.sent_at).toLocaleTimeString()).join(', ');
        console.log(`   - ${key}: ${logs.length} sends at ${times}`);
      });
      console.log('\n🚨 DUPLICATES STILL HAPPENING - FIX NOT WORKING!\n');
    } else {
      console.log('✅ No duplicates detected since Nov 20\n');
    }
  }

  // 4. Check Al's medications specifically
  console.log('4. Checking Al\'s medications for duplicates...');
  const { data: alUser, error: alError } = await supabase
    .from('users')
    .select('id')
    .eq('phone', '+16318334803')
    .single();

  if (!alError && alUser) {
    console.log(`Al's user ID: ${alUser.id}`);
    const { data: alLogs, error: alLogsError } = await supabase
      .from('medication_reminders_log')
      .select('medication_id, reminder_date, sent_at')
      .eq('user_id', alUser.id)
      .gte('reminder_date', '2025-11-20')
      .order('reminder_date', { ascending: true })
      .order('sent_at', { ascending: true });

    if (!alLogsError && alLogs) {
      console.log(`Al's logs since Nov 20: ${alLogs.length}`);
      const alGrouped = alLogs.reduce((acc, log) => {
        const key = `${log.medication_id}-${log.reminder_date}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
      }, {});
      
      const alDuplicates = Object.entries(alGrouped).filter(([key, logs]) => logs.length > 1);
      if (alDuplicates.length > 0) {
        console.log(`❌ Al has ${alDuplicates.length} duplicate dates:`);
        alDuplicates.forEach(([key, logs]) => {
          console.log(`   - ${key}: ${logs.length} sends`);
        });
      } else {
        console.log('✅ No duplicates for Al since Nov 20');
      }
    }
  } else {
    console.log('Could not find Al\'s user record');
  }

  console.log('\n=== NEXT STEPS ===');
  console.log('1. Check Render dashboard logs for "Lock acquired" and "Already sent" messages');
  console.log('2. Check when Render last deployed (should be after Nov 20)');
  console.log('3. If table exists but no logs today, cron job may not be running\n');
}

checkProductionDB().catch(console.error);
