# CRITICAL BUG: Duplicate SMS Medication Reminders

## Summary
Users received duplicate SMS medication reminders due to missing database constraint and race conditions between multiple server instances.

## Evidence
### Duplicate Sends on November 18, 2025
- **Antigens medication**: 2 SMS sent at 08:00 PST (should be 1)
  - First: `2025-11-18T16:00:01.091269Z`
  - Second: `2025-11-18T16:00:01.291392Z` (200ms later)

- **Apoquel medication**: 2 SMS sent at 08:00 PST (should be 1)
  - First: `2025-11-18T16:00:00.69372Z`
  - Second: `2025-11-18T16:00:00.888755Z` (195ms later)

### Apoquel Not Sending (Expected Behavior)
- Apoquel `end_date`: 2025-11-21
- Reminders correctly stopped after November 21
- This is NOT a bug

## Root Cause Analysis

### 1. Database Schema Mismatch
**Expected** (from `server/migrations/create-medication-reminders-log.sql`):
```sql
CREATE TABLE medication_reminders_log (
  id uuid PRIMARY KEY,
  medication_id uuid REFERENCES medications(id),
  user_id uuid REFERENCES profiles(id),
  reminder_date date NOT NULL,
  reminder_time text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  message_id text, -- Twilio message SID
  created_at timestamp with time zone DEFAULT now(),

  -- CRITICAL: Prevent duplicates
  CONSTRAINT unique_reminder_per_day UNIQUE(medication_id, reminder_date, reminder_time)
);
```

**Actual** (in production database):
```sql
CREATE TABLE medication_reminders_log (
  id uuid PRIMARY KEY,
  medication_id uuid,
  user_id uuid,
  reminder_date date,
  reminder_time text,
  created_at timestamp
  -- MISSING: message_id column
  -- MISSING: sent_at column
  -- MISSING: unique_reminder_per_day constraint ❌
);
```

### 2. Race Condition
File: `server/routes/medication-reminders.js:146-159`

```javascript
// Check if we already sent a reminder for this medication today
const { data: logCheck } = await supabase
  .from('medication_reminders_log')
  .select('id')
  .eq('medication_id', med.id)
  .eq('reminder_date', today)
  .eq('reminder_time', currentTime)
  .limit(1)
  .single()

if (logCheck) {
  // Skip - already sent
  continue
}
```

**Problem**: Without the unique constraint, when two server instances run simultaneously:

```
Time    Instance A                Instance B
---------------------------------------------------
08:00   Check log (empty) ✓       Check log (empty) ✓
08:00   Send SMS ✓                Send SMS ✓
08:00   Insert log ✓              Insert log ✓ (NO CONSTRAINT!)
```

Both inserts succeed → User gets 2 SMS

### 3. Why It Happened
- **Cron schedule**: `* * * * *` (every minute) at `server/index.js:509`
- **Multiple Render instances**: Production likely has 2+ instances
- **Clock sync**: Both trigger at exactly `08:00:00 PST`
- **200ms window**: Race condition occurs before either can log

## The Fix

### Step 1: Apply Database Migration
Run this SQL in Supabase Dashboard → SQL Editor:

```sql
-- File: fix-medication-reminders-schema.sql

-- 1. Add missing columns
ALTER TABLE medication_reminders_log
ADD COLUMN IF NOT EXISTS message_id text,
ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone DEFAULT now();

-- 2. Clean up existing duplicates (keep earliest)
DELETE FROM medication_reminders_log a
USING medication_reminders_log b
WHERE
  a.medication_id = b.medication_id AND
  a.reminder_date = b.reminder_date AND
  a.reminder_time = b.reminder_time AND
  a.created_at > b.created_at;

-- 3. Add unique constraint (prevents future duplicates)
ALTER TABLE medication_reminders_log
ADD CONSTRAINT unique_reminder_per_day
UNIQUE(medication_id, reminder_date, reminder_time);
```

### Step 2: Code Already Has Fixes
The code in `server/routes/medication-reminders.js` already has:

✅ **Fix #1**: Deduplication check (lines 146-159)
✅ **Fix #2**: Log with message_id (lines 211-228)
✅ **Fix #3**: Distributed locking (lines 13-77, 265-290)

These fixes will work properly once the database constraint is added.

## Verification Steps

### 1. Verify Schema Fix
```bash
node count-duplicates.cjs
```
Should show: `Second insert: FAILED (constraint working): 23505`

### 2. Verify Columns Exist
```javascript
const { data } = await supabase
  .from('medication_reminders_log')
  .select('*')
  .limit(1)

console.log(Object.keys(data[0]))
// Should include: 'message_id', 'sent_at'
```

### 3. Monitor Logs
Watch for duplicates in production:
```bash
tail -f server/server.log | grep "Medication Reminders"
```

Look for:
- `✅ Lock acquired` (only 1 instance should run)
- `🔒 Lock already held` (other instances skip)
- `✅ Logged reminder to prevent duplicates`

## Prevention

### Database Layer (Primary Defense)
- ✅ Unique constraint prevents duplicates even if code fails
- ✅ Cannot insert duplicate `(medication_id, reminder_date, reminder_time)`

### Application Layer (Secondary Defense)
- ✅ Distributed lock prevents race conditions
- ✅ Log check before sending
- ✅ Track Twilio message_id

### Monitoring
- ✅ Check `medication_reminders_log` for duplicates daily
- ✅ Alert if same medication has >1 entry per day/time
- ✅ Monitor Twilio for duplicate message_ids

## Impact
- **Severity**: HIGH (user experience issue, potential SMS costs)
- **Affected users**: Anyone with 08:00 PST medication reminders
- **Duration**: Nov 18, 2025 (one occurrence, then self-corrected)
- **SMS waste**: ~2x normal volume on affected days

## Files Changed
- `fix-medication-reminders-schema.sql` (NEW - migration to apply)
- `server/routes/medication-reminders.js` (already has fixes)
- `server/migrations/create-medication-reminders-log.sql` (reference)

## Related Files
- Investigation: `investigate-duplicate-sms.cjs`
- Testing: `count-duplicates.cjs`
- Schema check: `check-actual-schema.cjs`
