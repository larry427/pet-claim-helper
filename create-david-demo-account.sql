-- ================================================================================
-- CREATE DUPLICATE DEMO ACCOUNT FOR DAVID MARTIN
-- ================================================================================
-- This script copies ALL data from drsarah@petclaimhelper.com (Dr. Sarah)
-- to david@mybenefitexperience.com (David Martin)
--
-- PREREQUISITE: Create auth user first via Supabase Auth UI:
--   Email: david@mybenefitexperience.com
--   Password: <set a password>
--
-- After creating the auth user, run this script in Supabase SQL Editor
-- ================================================================================

-- Step 1: Get user IDs for both accounts
DO $$
DECLARE
  sarah_user_id UUID;
  david_user_id UUID;

  -- Mapping tables for ID translation
  pet_id_map JSONB := '{}'::JSONB;
  claim_id_map JSONB := '{}'::JSONB;
  medication_id_map JSONB := '{}'::JSONB;

  -- Loop variables
  old_pet_id UUID;
  new_pet_id UUID;
  old_claim_id UUID;
  new_claim_id UUID;
  old_med_id UUID;
  new_med_id UUID;
BEGIN
  -- Get Sarah's user ID (source)
  SELECT id INTO sarah_user_id
  FROM auth.users
  WHERE email = 'drsarah@petclaimhelper.com';

  -- Get David's user ID (target - you must create this auth user first!)
  SELECT id INTO david_user_id
  FROM auth.users
  WHERE email = 'david@mybenefitexperience.com';

  -- Validate both users exist
  IF sarah_user_id IS NULL THEN
    RAISE EXCEPTION 'Source user drsarah@petclaimhelper.com not found';
  END IF;

  IF david_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user david@mybenefitexperience.com not found. Create the auth user first!';
  END IF;

  RAISE NOTICE 'Sarah user ID: %', sarah_user_id;
  RAISE NOTICE 'David user ID: %', david_user_id;

  -- ============================================================================
  -- STEP 2: Copy Profile
  -- ============================================================================
  RAISE NOTICE 'Copying profile...';

  INSERT INTO public.profiles (
    id, email, email_notifications, full_name, phone, address,
    email_reminders, weekly_summaries, deadline_alerts,
    default_expense_category, default_time_period,
    insurance_company, filing_deadline_days, sms_opt_in,
    signature, created_at
  )
  SELECT
    david_user_id,  -- New user ID
    'david@mybenefitexperience.com',  -- New email
    email_notifications,
    'David Martin',  -- New name
    phone,
    address,
    email_reminders,
    weekly_summaries,
    deadline_alerts,
    default_expense_category,
    default_time_period,
    insurance_company,
    filing_deadline_days,
    sms_opt_in,
    signature,
    NOW()  -- New created_at timestamp
  FROM public.profiles
  WHERE id = sarah_user_id;

  RAISE NOTICE 'Profile copied successfully';

  -- ============================================================================
  -- STEP 3: Copy Pets (with new UUIDs)
  -- ============================================================================
  RAISE NOTICE 'Copying pets...';

  FOR old_pet_id IN
    SELECT id FROM public.pets WHERE user_id = sarah_user_id
  LOOP
    -- Generate new UUID for this pet
    new_pet_id := gen_random_uuid();

    -- Store mapping for later use
    pet_id_map := jsonb_set(pet_id_map, ARRAY[old_pet_id::text], to_jsonb(new_pet_id::text));

    -- Copy pet with new ID
    INSERT INTO public.pets (
      id, user_id, name, species, color, photo_url,
      insurance_company, policy_number, owner_name, owner_address, owner_phone,
      filing_deadline_days, date_of_birth, breed, gender, weight_lbs,
      monthly_premium, deductible_per_claim, coverage_start_date,
      annual_coverage_limit, insurance_pays_percentage,
      healthy_paws_pet_id, pumpkin_account_number, spot_account_number,
      had_other_insurance, other_insurance_provider, other_insurance_cancel_date,
      other_insurance_still_active, other_hospitals_visited,
      adoption_date, spay_neuter_status, spay_neuter_date, preferred_vet_name,
      created_at
    )
    SELECT
      new_pet_id,  -- New UUID
      david_user_id,  -- David's user ID
      name, species, color, photo_url,
      insurance_company, policy_number, owner_name, owner_address, owner_phone,
      filing_deadline_days, date_of_birth, breed, gender, weight_lbs,
      monthly_premium, deductible_per_claim, coverage_start_date,
      annual_coverage_limit, insurance_pays_percentage,
      healthy_paws_pet_id, pumpkin_account_number, spot_account_number,
      had_other_insurance, other_insurance_provider, other_insurance_cancel_date,
      other_insurance_still_active, other_hospitals_visited,
      adoption_date, spay_neuter_status, spay_neuter_date, preferred_vet_name,
      NOW()  -- New created_at timestamp
    FROM public.pets
    WHERE id = old_pet_id;

    RAISE NOTICE 'Copied pet: % -> %', old_pet_id, new_pet_id;
  END LOOP;

  RAISE NOTICE 'Pets copied successfully. Pet ID mappings: %', pet_id_map;

  -- ============================================================================
  -- STEP 4: Copy Claims (with new UUIDs and updated pet_id references)
  -- ============================================================================
  RAISE NOTICE 'Copying claims...';

  FOR old_claim_id IN
    SELECT id FROM public.claims WHERE user_id = sarah_user_id
  LOOP
    -- Generate new UUID for this claim
    new_claim_id := gen_random_uuid();

    -- Store mapping for later use
    claim_id_map := jsonb_set(claim_id_map, ARRAY[old_claim_id::text], to_jsonb(new_claim_id::text));

    -- Copy claim with new ID and updated pet_id
    INSERT INTO public.claims (
      id, user_id, pet_id, service_date, deadline_date,
      visit_title, invoice_number, clinic_name, clinic_address, clinic_phone,
      diagnosis, total_amount, line_items, filing_status,
      filing_deadline_days, filed_date, approved_date,
      reimbursed_amount, paid_date, visit_notes, pdf_path,
      sent_reminders, expense_category, medication_ids,
      created_at
    )
    SELECT
      new_claim_id,  -- New UUID
      david_user_id,  -- David's user ID
      -- Translate old pet_id to new pet_id
      CASE
        WHEN c.pet_id IS NOT NULL THEN
          (pet_id_map->>c.pet_id::text)::UUID
        ELSE NULL
      END,
      service_date, deadline_date,
      visit_title, invoice_number, clinic_name, clinic_address, clinic_phone,
      diagnosis, total_amount, line_items, filing_status,
      filing_deadline_days, filed_date, approved_date,
      reimbursed_amount, paid_date, visit_notes, pdf_path,
      sent_reminders, expense_category, medication_ids,
      NOW()  -- New created_at timestamp
    FROM public.claims c
    WHERE c.id = old_claim_id;

    RAISE NOTICE 'Copied claim: % -> %', old_claim_id, new_claim_id;
  END LOOP;

  RAISE NOTICE 'Claims copied successfully. Claim ID mappings: %', claim_id_map;

  -- ============================================================================
  -- STEP 5: Copy Medications (with new UUIDs and updated references)
  -- ============================================================================
  RAISE NOTICE 'Copying medications...';

  FOR old_med_id IN
    SELECT id FROM public.medications WHERE user_id = sarah_user_id
  LOOP
    -- Generate new UUID for this medication
    new_med_id := gen_random_uuid();

    -- Store mapping for later use
    medication_id_map := jsonb_set(medication_id_map, ARRAY[old_med_id::text], to_jsonb(new_med_id::text));

    -- Copy medication with new ID and updated references
    INSERT INTO public.medications (
      id, user_id, pet_id, claim_id,
      medication_name, dosage, frequency, reminder_times,
      start_date, end_date, created_at, updated_at
    )
    SELECT
      new_med_id,  -- New UUID
      david_user_id,  -- David's user ID
      -- Translate old pet_id to new pet_id
      (pet_id_map->>m.pet_id::text)::UUID,
      -- Translate old claim_id to new claim_id (if exists)
      CASE
        WHEN m.claim_id IS NOT NULL THEN
          (claim_id_map->>m.claim_id::text)::UUID
        ELSE NULL
      END,
      medication_name, dosage, frequency, reminder_times,
      start_date, end_date, NOW(), NOW()
    FROM public.medications m
    WHERE m.id = old_med_id;

    RAISE NOTICE 'Copied medication: % -> %', old_med_id, new_med_id;
  END LOOP;

  RAISE NOTICE 'Medications copied successfully. Medication ID mappings: %', medication_id_map;

  -- ============================================================================
  -- STEP 6: Copy Medication Doses (with new UUIDs and updated references)
  -- ============================================================================
  RAISE NOTICE 'Copying medication doses...';

  INSERT INTO public.medication_doses (
    id, medication_id, user_id, scheduled_time, given_time, status, created_at
  )
  SELECT
    gen_random_uuid(),  -- New UUID
    -- Translate old medication_id to new medication_id
    (medication_id_map->>md.medication_id::text)::UUID,
    david_user_id,  -- David's user ID
    scheduled_time, given_time, status, NOW()
  FROM public.medication_doses md
  WHERE md.user_id = sarah_user_id;

  RAISE NOTICE 'Medication doses copied successfully';

  -- ============================================================================
  -- STEP 7: Copy Medication Reminders Log (with new UUIDs and updated references)
  -- ============================================================================
  RAISE NOTICE 'Copying medication reminders log...';

  INSERT INTO public.medication_reminders_log (
    id, medication_id, user_id, reminder_date, reminder_time, sent_at
  )
  SELECT
    gen_random_uuid(),  -- New UUID
    -- Translate old medication_id to new medication_id
    (medication_id_map->>mrl.medication_id::text)::UUID,
    david_user_id,  -- David's user ID
    reminder_date, reminder_time, sent_at
  FROM public.medication_reminders_log mrl
  WHERE mrl.user_id = sarah_user_id;

  RAISE NOTICE 'Medication reminders log copied successfully';

  -- ============================================================================
  -- STEP 8: Copy SMS Consent (with new UUIDs and updated references)
  -- ============================================================================
  RAISE NOTICE 'Copying SMS consent records...';

  INSERT INTO public.sms_consent (
    id, user_id, phone_number, consented, consent_timestamp, ip_address, consent_text
  )
  SELECT
    gen_random_uuid(),  -- New UUID
    david_user_id,  -- David's user ID
    phone_number, consented, consent_timestamp, ip_address, consent_text
  FROM public.sms_consent
  WHERE user_id = sarah_user_id;

  RAISE NOTICE 'SMS consent records copied successfully';

  -- ============================================================================
  -- DONE!
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '================================================================================';
  RAISE NOTICE 'DUPLICATION COMPLETE!';
  RAISE NOTICE '================================================================================';
  RAISE NOTICE 'New demo account created for David Martin';
  RAISE NOTICE 'Email: david@mybenefitexperience.com';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Profile: Copied';
  RAISE NOTICE '  - Pets: Copied with photos, insurance info, and all details';
  RAISE NOTICE '  - Claims: Copied with statuses, amounts, and all details';
  RAISE NOTICE '  - Medications: Copied with dosing schedules';
  RAISE NOTICE '  - Medication doses: Copied';
  RAISE NOTICE '  - Medication reminders log: Copied';
  RAISE NOTICE '  - SMS consent: Copied';
  RAISE NOTICE '================================================================================';

END $$;
