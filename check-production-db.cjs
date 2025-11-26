// Check if medication_reminders_log table exists in production and has data
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    console.log('\nFIX NOT DEPLOYED - Table missing!\n');
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
    console.log('Either no reminders sent yet, or fix not running\n');
  } else {
    console.log(`✅ Found ${todayLogs.length} log entries for today:`);
    todayLogs.forEach(log => {
      console.log(`   - Med ID: ${log.medication_id}, User: ${log.user_id}, Sent: ${log.sent_at}`);
    });
    console.log();
  }

  // 3. Check for UNIQUE constraint
  console.log('3. Checking for UNIQUE constraint on medication_reminders_log...');
  const { data: constraints, error: constraintsError } = await supabase.rpc('exec_sql', {
    sql: `SELECT constraint_name, constraint_type 
          FROM information_schema.table_constraints 
          WHERE table_name = 'medication_reminders_log' 
          AND constraint_type = 'UNIQUE'`
  }).catch(async () => {
    // Fallback: try direct query
    const { data, error } = await supabase
      .from('pg_constraint')
      .select('conname')
      .limit(1);
    return { data: null, error: new Error('Cannot query constraints - need RLS or direct SQL access') };
  });

  if (constraintsError) {
    console.log('⚠️  Cannot verify constraint (need SQL access)');
    console.log('Check Supabase SQL Editor manually:\n');
    console.log('SELECT constraint_name FROM information_schema.table_constraints');
    console.log('WHERE table_name = \'medication_reminders_log\' AND constraint_type = \'UNIQUE\';');
    console.log();
  } else if (!constraints || constraints.length === 0) {
    console.log('❌ No UNIQUE constraint found - FIX NOT COMPLETE!\n');
  } else {
    console.log('✅ UNIQUE constraint exists:', constraints.map(c => c.constraint_name).join(', '));
    console.log();
  }

  // 4. Check recent duplicates
  console.log('4. Checking for duplicate reminders sent recently...');
  const { data: recentLogs, error: recentError } = await supabase
    .from('medication_reminders_log')
    .select('medication_id, user_id, reminder_date, sent_at')
    .gte('reminder_date', '2025-11-20')
    .order('medication_id', { ascending: true })
    .order('reminder_date', { ascending: true })
    .order('sent_at', { ascending: true });

  if (!recentError && recentLogs) {
    const grouped = recentLogs.reduce((acc, log) => {
      const key = `${log.medication_id}-${log.reminder_date}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});

    const duplicates = Object.entries(grouped).filter(([key, logs]) => logs.length > 1);
    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate reminder dates since Nov 20:`);
      duplicates.forEach(([key, logs]) => {
        console.log(`   - ${key}: ${logs.length} sends at ${logs.map(l => new Date(l.sent_at).toLocaleTimeString()).join(', ')}`);
      });
      console.log('\n❌ DUPLICATES STILL HAPPENING - FIX NOT WORKING!\n');
    } else {
      console.log('✅ No duplicates detected since Nov 20\n');
    }
  }

  console.log('=== SUMMARY ===');
  console.log('Check Render logs (dashboard) for "Lock acquired" and "Already sent" messages');
  console.log('If table exists but no logs, the cron job may not be running the new code\n');
}

checkProductionDB().catch(console.error);
