# Admin Dashboard Setup Instructions

## Overview
A complete admin dashboard has been integrated into Pet Claim Helper at the `/admin` route.

## Setup Steps

### 1. Run Database Migration

You need to add the `is_admin` column to the `profiles` table in Supabase.

**Option A: Supabase SQL Editor (Recommended)**

1. Go to your Supabase project: https://supabase.com/dashboard/project/hyrgqrgeshkgvsfwnzzu/sql
2. Click "New Query"
3. Copy and paste the following SQL:

```sql
-- Add is_admin column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- Set larry@uglydogadventures.com as admin
UPDATE profiles
SET is_admin = true
WHERE email = 'larry@uglydogadventures.com';

-- Verify the change
SELECT email, full_name, is_admin
FROM profiles
WHERE email = 'larry@uglydogadventures.com';
```

4. Click "Run" or press Ctrl+Enter
5. You should see the verification query return your profile with `is_admin = true`

**Option B: Using the migration file**

The SQL is also saved in: `add-admin-column-migration.sql`

### 2. Test Locally

```bash
npm run dev
```

1. Login as larry@uglydogadventures.com
2. You should see a new "📊 Admin Dashboard" button in the navigation
3. Click it to view the admin dashboard

### 3. Deploy to Production

```bash
npm run build
git add .
git commit -m "Add admin dashboard with user and claim management"
git push
```

The changes will automatically deploy to Vercel.

## Features Included

### Top Metrics Cards
- **Total Users** - Shows active vs inactive breakdown
- **Total Pets** - Count across all users
- **Total Claims** - Shows draft/submitted/paid breakdown
- **Total Amount** - Sum of all claim amounts

### Insurance Breakdown
- Claims grouped by insurance company
- Visual breakdown with counts

### Users Table
- Sortable columns: Email, Name, Pets Count, Claims Count, Last Active
- Status badges (Active, Pet-only, Inactive)
- Click to expand user details
- Shows user's pets and recent claims

### Claims Table
- Filter by status (Draft, Submitted, Paid)
- Filter by insurance company
- Shows user email, pet name, service date, amount
- PDF attachment indicator
- Total claim amounts at bottom

## Security

- Admin dashboard is only accessible if `is_admin = true` in profiles table
- Non-admin users see "Access Denied" message
- Admin button only visible to admin users

## Files Modified

1. `src/components/AdminDashboard.tsx` - New component
2. `src/App.tsx` - Added admin route and navigation
3. `add-admin-column-migration.sql` - Database migration

## Troubleshooting

**Admin button not showing?**
- Make sure the SQL migration ran successfully
- Check that `is_admin = true` for your profile
- Try logging out and logging back in

**"Column not found" error?**
- The migration didn't run yet
- Go to Supabase SQL Editor and run the migration

**Access Denied message?**
- Your profile doesn't have `is_admin = true`
- Re-run the UPDATE statement in Supabase
