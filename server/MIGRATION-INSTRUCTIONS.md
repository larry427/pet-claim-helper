# Database Migration Instructions

## Add Claim Submission Tracking

**Migration File:** `migrations/add-claim-submission-tracking.sql`

### What This Migration Does

Adds three new columns to the `claims` table to track submission status:

1. **submission_status** - TEXT field (default: 'draft')
   - Possible values: 'draft', 'submitted', 'approved', 'denied'

2. **submitted_at** - TIMESTAMPTZ field
   - Records when the claim was submitted to the insurance company

3. **submission_email_id** - TEXT field
   - Stores the Resend email message ID for tracking

### How to Run This Migration

#### Option 1: Supabase SQL Editor (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of `migrations/add-claim-submission-tracking.sql`
5. Click **Run** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)
6. Verify success - you should see "Success. No rows returned"

#### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db execute -f server/migrations/add-claim-submission-tracking.sql
```

#### Option 3: psql Command Line

```bash
# If you have direct database access
psql <your-database-url> < server/migrations/add-claim-submission-tracking.sql
```

### Verification

After running the migration, verify the columns exist:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'claims'
  AND column_name IN ('submission_status', 'submitted_at', 'submission_email_id');
```

Expected result:
| column_name | data_type | column_default |
|-------------|-----------|----------------|
| submission_status | text | 'draft'::text |
| submitted_at | timestamp with time zone | NULL |
| submission_email_id | text | NULL |

### Rollback (if needed)

If you need to rollback this migration:

```sql
-- Remove the columns
ALTER TABLE claims
DROP COLUMN IF EXISTS submission_status,
DROP COLUMN IF EXISTS submitted_at,
DROP COLUMN IF EXISTS submission_email_id;

-- Remove the indexes
DROP INDEX IF EXISTS idx_claims_submission_status;
DROP INDEX IF EXISTS idx_claims_submitted_at;
```

## Notes

- This migration is **safe to run multiple times** (uses `IF NOT EXISTS` and `IF NULL`)
- Existing claims will be updated to have `submission_status = 'draft'`
- Indexes are created for better query performance
