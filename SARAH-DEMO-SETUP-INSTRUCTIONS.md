# Create Dr. Sarah Cortright Demo Account

## Overview
This guide will create a duplicate demo account with the same data as Brady's demo account (demo@petclaimhelper.com).

**New Account Details:**
- Email: `drsarah@petclaimhelper.com`
- Password: `Cortright`
- Name: Dr. Sarah Cortright

---

## Step-by-Step Instructions

### Step 1: Create Auth User in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **Add User** → **Create new user**
4. Enter:
   - Email: `drsarah@petclaimhelper.com`
   - Password: `Cortright`
   - ✅ Check "Auto Confirm User" (so she can login immediately)
5. Click **Create User**
6. **IMPORTANT:** Copy the User ID (UUID) that was just created

### Step 2: Run the SQL Duplication Script

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open a new query
4. Copy and paste the entire contents of `create-sarah-demo-account.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Wait for the script to complete
7. Check the output logs - you should see:
   ```
   ================================================================================
   DUPLICATION COMPLETE!
   ================================================================================
   New demo account created for Dr. Sarah Cortright
   Email: drsarah@petclaimhelper.com
   Password: Cortright

   Summary:
     - Profile: Copied
     - Pets: X records copied
     - Claims: X records copied
     - Medications: X records copied
     - Medication doses: Copied
     - Medication reminders log: Copied
     - SMS consent: Copied
   ================================================================================
   ```

### Step 3: Verify the Account

1. Log out of any existing sessions
2. Go to your app login page
3. Login with:
   - Email: `drsarah@petclaimhelper.com`
   - Password: `Cortright`
4. Verify you see:
   - ✅ Same pets as Brady's account
   - ✅ Same claims/bills as Brady's account
   - ✅ Same medications as Brady's account
   - ✅ Profile shows "Dr. Sarah Cortright"

---

## What Gets Copied

The script copies **all data** from Brady's account:

| Table | What's Copied |
|-------|---------------|
| **profiles** | Profile settings, signature, insurance info (name/email updated) |
| **pets** | All pets with insurance details, photos, breed, etc. |
| **claims** | All vet bills/claims with invoices, diagnoses, line items |
| **medications** | Active and past medications with dosages, schedules |
| **medication_doses** | Medication tracking history (given/pending doses) |
| **medication_reminders_log** | SMS reminder history |
| **sms_consent** | SMS opt-in consent records |

All UUIDs are regenerated, so Sarah's data is completely independent from Brady's.

---

## Troubleshooting

### Error: "Target user drsarah@petclaimhelper.com not found"
- You need to create the auth user first (Step 1)
- Make sure the email is exactly `drsarah@petclaimhelper.com`

### Error: "Source user demo@petclaimhelper.com not found"
- Brady's demo account doesn't exist in this database
- Check that you're running this in the correct Supabase project

### Script runs but no data appears
- Check RLS (Row Level Security) policies are enabled
- Try logging out and back in
- Check browser console for errors

---

## Notes

- The script is **idempotent-safe** - you can run it multiple times if needed (though you'll need to delete Sarah's profile first to avoid conflicts)
- All timestamps are set to NOW() so the data appears fresh
- Pet photos won't be copied (only the photo_url reference) - if Brady has uploaded pet photos, they'll still point to Brady's storage folder (this is fine for demo purposes)
- PDF files in storage won't be duplicated (only the pdf_path reference remains)

---

## Support

If you encounter any issues:
1. Check the Supabase SQL Editor output for error messages
2. Verify the auth user was created successfully
3. Check the logs for any RAISE NOTICE messages that show progress
