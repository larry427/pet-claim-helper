# 🚀 MVP AUTO-SUBMIT FEATURE - TESTING GUIDE

## ✅ PHASES 1-6 COMPLETE!

All backend and frontend code is ready. Now we need to test end-to-end.

---

## 🧪 STEP 1: RUN DATABASE MIGRATION

**IMPORTANT:** This adds 3 new columns to track submission status.

### Option A: Supabase SQL Editor (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste this SQL:

```sql
-- Add submission tracking columns to claims table
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS submission_status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS submission_email_id TEXT;

-- Add indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_claims_submission_status ON claims(submission_status);
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON claims(submitted_at);

-- Add comments
COMMENT ON COLUMN claims.submission_status IS 'Status of claim submission: draft, submitted, approved, denied';
COMMENT ON COLUMN claims.submitted_at IS 'Timestamp when claim was submitted to insurance company';
COMMENT ON COLUMN claims.submission_email_id IS 'Resend email message ID for tracking';

-- Update existing claims to 'draft' status
UPDATE claims
SET submission_status = 'draft'
WHERE submission_status IS NULL;
```

5. Click **Run** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)
6. You should see "Success. No rows returned"

### Verify Migration Worked

Run this query to check the new columns exist:

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

✅ If you see this, migration is complete!

---

## 🚀 STEP 2: START THE APP

```bash
# Terminal 1 - Start backend server
cd server
npm run server

# Terminal 2 - Start frontend
npm run dev
```

Make sure both are running without errors.

---

## 🧪 STEP 3: TEST END-TO-END SUBMISSION

### 3.1 Create a Test Claim (if you don't have one)

1. Open http://localhost:5173 in your browser
2. Log in with your account
3. Upload a vet invoice (or use existing claim)
4. Make sure the claim has:
   - ✅ Pet assigned
   - ✅ Clinic name
   - ✅ Service date
   - ✅ Diagnosis/reason
   - ✅ Total amount
   - ✅ Status: "Not Submitted"

### 3.2 Click "Auto-Submit to Insurance" Button

1. Scroll to your claims list
2. Find a claim with status "Not Submitted"
3. You should see **TWO buttons:**
   - 🚀 **Auto-Submit to Insurance** (blue button - NEW!)
   - **Mark as Submitted** (green button - existing)

4. Click **"Auto-Submit to Insurance"**

### 3.3 Review Confirmation Modal

You should see a professional modal with:

- ✅ **Claim Summary** (pet name, clinic, date, amount)
- ✅ **What Will Happen** (4-step process)
- ✅ **Test Mode Warning** (yellow box explaining email goes to larry@uglydogadventures.com)
- ✅ **Two buttons:** "Submit to [Insurer]" and "Cancel"

Click **"Submit to [Insurer]"**

### 3.4 Watch Submission Progress

You should see animated progress with 3 steps:
- 🟢 Creating claim form PDF...
- 🔵 Sending email to insurance company...
- 🟣 Updating claim status...

### 3.5 Verify Success Modal

After ~5-10 seconds, you should see:
- ✅ Green checkmark
- ✅ "Claim Submitted!" message
- ✅ "What happens next" section
- ✅ Tracking ID shown
- ✅ "Done" button

Click **"Done"** to close the modal.

### 3.6 Verify Claim Status Updated

- Claim card should now show status badge: **"Claim - Filed"** (green)
- Auto-Submit button should be hidden
- Claim should show filed date

---

## 📧 STEP 4: CHECK YOUR EMAIL

### 4.1 Open larry@uglydogadventures.com

You should receive **TWO copies** of the email:

1. **TO:** larry@uglydogadventures.com (because TEST_MODE redirects all emails here)
2. **BCC:** Your user email (the policyholder)

### 4.2 Verify Email Contents

✅ **Subject:** `Pet Insurance Claim Submission - [Policy Number] - [Pet Name]`

✅ **Email Body Should Include:**
- Beautiful HTML template with gradient blue header
- Claim summary table (policy number, pet name, clinic, date)
- Total claim amount (large, bold)
- Attachments section showing claim form PDF
- Diagnosis/reason for visit
- "What's included" checklist
- Policyholder contact info
- Footer with Pet Claim Helper branding

✅ **PDF Attachment:**
- Filename: `claim-form-[Policy Number].pdf`
- Size: ~12-15KB
- Opens correctly and shows all claim details

### 4.3 Open and Verify PDF

The PDF should have:
- ✅ **Page 1:**
  - Blue header with "PET INSURANCE CLAIM FORM" and insurer name
  - Section 1: Policyholder Information
  - Section 2: Pet Information
  - Section 3: Treatment Information (with diagnosis)
  - Section 4: Claim Amount (itemized table)

- ✅ **Page 2:**
  - Total amount claimed (bold)
  - Section 5: Authorization & Signature
  - Fraud warning (in red)
  - Signature line with your name
  - Date signed
  - Footer with branding and submission date

---

## 🛢️ STEP 5: VERIFY DATABASE UPDATES

### 5.1 Check Supabase Claims Table

Go to Supabase → Table Editor → claims table

Find the claim you just submitted and verify:

| Column | Expected Value |
|--------|---------------|
| `submission_status` | `'submitted'` |
| `submitted_at` | Current timestamp (should be within last minute) |
| `submission_email_id` | Resend message ID (starts with a UUID-like string) |
| `filing_status` | Should still be 'not_filed' or 'not_submitted' (unchanged) |

✅ **All three new columns should be populated!**

---

## 🎯 STEP 6: TEST ERROR CASES

### Test 1: Invalid Claim (Missing Required Fields)

1. Create a claim with **missing clinic name** or **missing pet**
2. Click "Auto-Submit to Insurance"
3. ✅ Should see error modal: "Invalid claim data: Missing required fields..."

### Test 2: Network Error

1. Stop the backend server (`Ctrl+C` in server terminal)
2. Try to submit a claim
3. ✅ Should see error modal: "Failed to submit claim" with retry option

### Test 3: Cancellation

1. Click "Auto-Submit to Insurance"
2. In the confirmation modal, click **"Cancel"**
3. ✅ Modal should close, claim status unchanged

---

## 🔍 STEP 7: TEST WITH DIFFERENT INSURERS

The system supports 3 insurers. Test each:

### Nationwide
- Email should go to: `claims@petinsurance.com` (in production)
- PDF header should say: **NATIONWIDE**

### Healthy Paws
- Email should go to: `claims@healthypawspetinsurance.com` (in production)
- PDF header should say: **HEALTHYPAWS**

### Trupanion
- Email should go to: `claims@trupanion.com` (in production)
- PDF header should say: **TRUPANION**

**Note:** In TEST_MODE, all go to larry@uglydogadventures.com, but the email should still say which insurer it's "for".

---

## 🚨 TROUBLESHOOTING

### Issue: "Auto-Submit" button not showing

**Fix:**
- Make sure claim has `filing_status = 'not_submitted'` or `'not_filed'`
- Check that claim has `expense_category = 'insured'` (not 'not_insured')
- Refresh the page

### Issue: Error "Missing API key. Pass it to the constructor"

**Fix:**
- Check `server/.env.local` has `RESEND_API_KEY=re_...`
- Restart the backend server

### Issue: PDF generation fails

**Fix:**
- Check server logs for specific error
- Verify `jspdf` is installed: `cd server && npm list jspdf`
- Reinstall if needed: `npm install jspdf`

### Issue: Email not received

**Fix:**
- Check server logs - should show "Email sent:" with message ID
- Check Resend dashboard: https://resend.com/emails
- Verify TEST_EMAIL = 'larry@uglydogadventures.com' in `server/lib/generateClaimPDF.js`
- Check spam folder

### Issue: Claim status not updating

**Fix:**
- Check browser console for errors
- Verify migration ran successfully (Step 1)
- Check Supabase table editor - does `submission_status` column exist?

---

## ✅ SUCCESS CRITERIA

You'll know everything is working when:

1. ✅ Migration added 3 new columns to claims table
2. ✅ "Auto-Submit" button appears on "Not Submitted" claims
3. ✅ Confirmation modal shows with claim details and test mode warning
4. ✅ Email arrives at larry@uglydogadventures.com within 30 seconds
5. ✅ PDF attachment opens and shows professional claim form
6. ✅ Claim status updates to "Submitted" in dashboard
7. ✅ Database shows `submission_status='submitted'` and has message ID

---

## 🎉 WHEN READY FOR PRODUCTION

To switch from TEST_MODE to PRODUCTION MODE:

1. Open `server/lib/generateClaimPDF.js`
2. Find line ~251:
   ```javascript
   const TEST_MODE = true  // Change this to false
   ```
3. Change to:
   ```javascript
   const TEST_MODE = false  // NOW IN PRODUCTION!
   ```
4. Restart the backend server
5. **⚠️ WARNING:** Claims will now be sent to REAL insurance companies!

---

## 📊 PHASE 7: FINAL TESTING CHECKLIST

- [ ] Database migration successful
- [ ] Auto-Submit button visible on eligible claims
- [ ] Confirmation modal shows claim details
- [ ] Test mode warning displayed
- [ ] PDF generates successfully
- [ ] Email sent to larry@uglydogadventures.com
- [ ] BCC sent to user email
- [ ] PDF attachment opens correctly
- [ ] All 5 sections present in PDF
- [ ] Claim status updates to "Submitted"
- [ ] Database columns populated correctly
- [ ] Tested with Nationwide
- [ ] Tested with Healthy Paws
- [ ] Tested with Trupanion
- [ ] Error handling works (missing fields)
- [ ] Cancellation works
- [ ] Success toast notification appears

---

## 🎊 YOU'RE DONE!

Once all checklist items are complete, the MVP Auto-Submit feature is **PRODUCTION READY**!

Next steps:
- Test with real claims (in TEST_MODE)
- Get user feedback on the flow
- Consider adding invoice PDF attachment (Phase 8)
- Add email tracking/status webhooks from Resend
- Build admin dashboard to see submission history

**Estimated Development Time:** 8-10 hours ✅ **COMPLETE!**
