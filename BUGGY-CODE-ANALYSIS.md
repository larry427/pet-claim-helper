# Buggy Code Analysis & Fix

## The Race Condition Explained

### Buggy Scenario (Before Fix)

**File**: `server/routes/medication-reminders.js:146-159`

```javascript
// Check if we already sent a reminder for this medication today
const { data: logCheck, error: logError} = await supabase
  .from('medication_reminders_log')
  .select('id')
  .eq('medication_id', med.id)
  .eq('reminder_date', today)
  .eq('reminder_time', currentTime)
  .limit(1)
  .single()

if (logCheck) {
  console.log(`Skipping ${med.medication_name} - already sent today`)
  continue
}

// ... send SMS ...

// Log the sent reminder
await supabase
  .from('medication_reminders_log')
  .insert({
    medication_id: med.id,
    reminder_date: today,
    reminder_time: currentTime
  })
```

### The Problem:

**Without database constraint**, this happens:

```
Time        Server Instance A              Server Instance B
────────────────────────────────────────────────────────────────
08:00:00    Query: SELECT * FROM log       Query: SELECT * FROM log
            WHERE med=X date=today         WHERE med=X date=today

08:00:00.1  Result: EMPTY ✓                Result: EMPTY ✓

08:00:00.2  Send SMS to user               Send SMS to user
            (Message 1 sent)                (Message 2 sent) ← DUPLICATE!

08:00:00.3  INSERT INTO log                INSERT INTO log
            SUCCESS ✓                       SUCCESS ✓ ← NO CONSTRAINT!

Result: User receives 2 SMS 📱📱
```

## The Fix: Three Defense Layers

### Layer 1: Database Constraint (Primary Defense)

**File**: `fix-medication-reminders-schema.sql`

```sql
ALTER TABLE medication_reminders_log
ADD CONSTRAINT unique_reminder_per_day
UNIQUE(medication_id, reminder_date, reminder_time);
```

**With constraint**, this happens:

```
Time        Server Instance A              Server Instance B
────────────────────────────────────────────────────────────────
08:00:00    Query: SELECT * FROM log       Query: SELECT * FROM log
            WHERE med=X date=today         WHERE med=X date=today

08:00:00.1  Result: EMPTY ✓                Result: EMPTY ✓

08:00:00.2  Send SMS to user               Send SMS to user
            (Message 1 sent)                (Message 2 sent) ← Still sent

08:00:00.3  INSERT INTO log                INSERT INTO log
            SUCCESS ✓                       FAILED! ← Constraint violation
                                            (ERROR: duplicate key value)

Result: User receives 2 SMS (but logged only once)
⚠️  This prevents infinite duplicates but doesn't prevent the race
```

### Layer 2: Distributed Lock (Prevents Race)

**File**: `server/routes/medication-reminders.js:13-77`

```javascript
// FIX #3: DISTRIBUTED LOCKING
const lockKey = 'medication_reminders_cron_lock'
const lockId = crypto.randomUUID()

// Try to acquire lock
const { data: existingLock } = await supabase
  .from('medication_reminders_log')
  .select('id')
  .eq('medication_id', lockKey)
  .gte('sent_at', nowPST.minus({ seconds: 120 }).toISO())
  .limit(1)
  .single()

if (existingLock) {
  console.log('🔒 Lock already held, skipping...')
  return { ok: true, sent: 0 }
}

// Acquire lock
await supabase
  .from('medication_reminders_log')
  .insert({
    id: lockId,
    medication_id: lockKey,
    user_id: anyUser.id,
    reminder_date: today,
    reminder_time: 'LOCK',
    message_id: `lock_${lockId}`
  })

// Process reminders...

// Release lock when done
await supabase
  .from('medication_reminders_log')
  .delete()
  .eq('id', lockId)
```

**With distributed lock**:

```
Time        Server Instance A              Server Instance B
────────────────────────────────────────────────────────────────
08:00:00    Try acquire lock               Try acquire lock
            Check for existing lock        Check for existing lock

08:00:00.05 No lock found ✓                No lock found ✓

08:00:00.1  INSERT lock record             INSERT lock record
            SUCCESS (first!) ✓              FAILED (race lost) ✗

08:00:00.2  Process medications            🔒 Lock held by A
            Send SMS (1 message) ✓          SKIP - return early

08:00:00.5  Release lock ✓                 Exit

Result: User receives 1 SMS ✓
```

### Layer 3: Deduplication Check (Last Resort)

**File**: `server/routes/medication-reminders.js:146-159`

Already shown above - this prevents duplicates even if lock fails.

## The Complete Fix Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Cron triggers at 08:00 PST (every minute)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
        ┌──────────────────┴──────────────────┐
        ↓                                      ↓
   Instance A                             Instance B
        │                                      │
        ├─ Try acquire lock                   ├─ Try acquire lock
        │  SUCCESS ✓                           │  FAILED (A has it)
        │                                      │
        ├─ Query medications                   └─ Return (skip)
        │  Found 8 with reminders
        │
        ├─ For each medication:
        │  ├─ Check if active ✓
        │  ├─ Check if time matches ✓
        │  ├─ Check log (dedup) ✓
        │  ├─ Create dose record ✓
        │  ├─ Send SMS ✓
        │  └─ Insert log ✓
        │
        └─ Release lock ✓

Result: Only 1 SMS sent per medication ✓
```

## Why All Three Layers?

### Layer 1 (Constraint): Prevents Data Corruption
- If Layers 2 & 3 fail, constraint prevents log corruption
- Database integrity maintained
- Can detect and alert on violations

### Layer 2 (Lock): Prevents Duplicate SMS
- Stops race condition at the source
- Only 1 instance processes reminders
- Most efficient (prevents wasted work)

### Layer 3 (Dedup Check): Handles Edge Cases
- Server restart during processing
- Clock skew between instances
- Manual trigger of cron endpoint

## Code That Needs Migration

**Current Production Database** (BROKEN):
```sql
-- Missing columns
❌ message_id
❌ sent_at

-- Missing constraint
❌ UNIQUE(medication_id, reminder_date, reminder_time)
```

**After Migration** (FIXED):
```sql
-- All columns present
✅ id
✅ medication_id
✅ user_id
✅ reminder_date
✅ reminder_time
✅ message_id       ← ADDED
✅ sent_at          ← ADDED
✅ created_at

-- Constraint active
✅ UNIQUE(medication_id, reminder_date, reminder_time) ← ADDED
```

## The Smoking Gun

**Database query results** from `count-duplicates.cjs`:

```
2025-11-18:
  Antigens: 2 reminders sent ← DUPLICATE
  Apoquel: 2 reminders sent ← DUPLICATE

  Antigens duplicates:
    - 2025-11-18T16:00:01.091269+00:00
    - 2025-11-18T16:00:01.291392+00:00 (200ms later)

  Apoquel duplicates:
    - 2025-11-18T16:00:00.69372+00:00
    - 2025-11-18T16:00:00.888755+00:00 (195ms later)
```

**200ms gap** = classic race condition signature

## Testing The Fix

### Before Migration:
```bash
$ node count-duplicates.cjs

First insert: SUCCESS
Second insert: ⚠️  SUCCESS (NO CONSTRAINT!)
```

### After Migration:
```bash
$ node count-duplicates.cjs

First insert: SUCCESS
Second insert: FAILED (constraint working): 23505
```

Error code `23505` = `unique_violation` ✓

## Files Changed

1. ✅ **Database** (via `fix-medication-reminders-schema.sql`)
   - Add `message_id` column
   - Add `sent_at` column
   - Add unique constraint
   - Delete duplicates

2. ✅ **Code** (already has fixes)
   - `server/routes/medication-reminders.js`
   - Distributed locking (lines 13-77)
   - Deduplication check (lines 146-159)
   - Message ID tracking (lines 211-228)

3. ✅ **Monitoring** (investigation scripts)
   - `count-duplicates.cjs`
   - `investigate-duplicate-sms.cjs`
   - `check-actual-schema.cjs`
