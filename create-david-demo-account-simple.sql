-- ================================================================================
-- CREATE DEMO ACCOUNT FOR DAVID MARTIN (SIMPLIFIED)
-- ================================================================================
-- Copies data from drsarah@petclaimhelper.com to david@mybenefitexperience.com
--
-- PREREQUISITE: Create auth user first via Supabase Auth UI:
--   Email: david@mybenefitexperience.com
--   Password: <set a password>
--
-- After creating the auth user, run this script in Supabase SQL Editor
-- ================================================================================

DO $$
DECLARE
  sarah_user_id UUID;
  david_user_id UUID;
  pet_id_map JSONB := '{}'::JSONB;
  claim_id_map JSONB := '{}'::JSONB;
  medication_id_map JSONB := '{}'::JSONB;
  old_pet_id UUID;
  new_pet_id UUID;
  old_claim_id UUID;
  new_claim_id UUID;
  old_med_id UUID;
  new_med_id UUID;
BEGIN
  -- Get user IDs
  SELECT id INTO sarah_user_id FROM auth.users WHERE email = 'drsarah@petclaimhelper.com';
  SELECT id INTO david_user_id FROM auth.users WHERE email = 'david@mybenefitexperience.com';

  IF sarah_user_id IS NULL THEN RAISE EXCEPTION 'Source user not found'; END IF;
  IF david_user_id IS NULL THEN RAISE EXCEPTION 'Target user not found - create auth user first'; END IF;

  RAISE NOTICE 'Copying from Sarah (%) to David (%)', sarah_user_id, david_user_id;

  -- ============================================================================
  -- Copy Profile (only guaranteed columns)
  -- ============================================================================
  INSERT INTO public.profiles (
    id, email, full_name, phone, address, created_at
  )
  SELECT
    david_user_id,
    'david@mybenefitexperience.com',
    'David Martin',
    phone,
    address,
    NOW()
  FROM public.profiles
  WHERE id = sarah_user_id;

  RAISE NOTICE 'Profile copied';

  -- ============================================================================
  -- Copy Pets
  -- ============================================================================
  FOR old_pet_id IN SELECT id FROM public.pets WHERE user_id = sarah_user_id
  LOOP
    new_pet_id := gen_random_uuid();
    pet_id_map := jsonb_set(pet_id_map, ARRAY[old_pet_id::text], to_jsonb(new_pet_id::text));

    INSERT INTO public.pets (
      id, user_id, name, species, color, photo_url,
      insurance_company, policy_number, owner_name, owner_address, owner_phone,
      filing_deadline_days, created_at
    )
    SELECT
      new_pet_id, david_user_id, name, species, color, photo_url,
      insurance_company, policy_number, owner_name, owner_address, owner_phone,
      filing_deadline_days, NOW()
    FROM public.pets WHERE id = old_pet_id;

    RAISE NOTICE 'Copied pet: %', old_pet_id;
  END LOOP;

  -- ============================================================================
  -- Copy Claims
  -- ============================================================================
  FOR old_claim_id IN SELECT id FROM public.claims WHERE user_id = sarah_user_id
  LOOP
    new_claim_id := gen_random_uuid();
    claim_id_map := jsonb_set(claim_id_map, ARRAY[old_claim_id::text], to_jsonb(new_claim_id::text));

    INSERT INTO public.claims (
      id, user_id, pet_id, service_date, deadline_date,
      visit_title, invoice_number, clinic_name, clinic_address,
      diagnosis, total_amount, line_items, filing_status,
      filing_deadline_days, filed_date, approved_date,
      reimbursed_amount, paid_date, visit_notes, pdf_path,
      sent_reminders, expense_category, medication_ids, created_at
    )
    SELECT
      new_claim_id, david_user_id,
      CASE WHEN c.pet_id IS NOT NULL THEN (pet_id_map->>c.pet_id::text)::UUID ELSE NULL END,
      service_date, deadline_date, visit_title, invoice_number, clinic_name, clinic_address,
      diagnosis, total_amount, line_items, filing_status,
      filing_deadline_days, filed_date, approved_date,
      reimbursed_amount, paid_date, visit_notes, pdf_path,
      sent_reminders, expense_category, medication_ids, NOW()
    FROM public.claims c WHERE c.id = old_claim_id;

    RAISE NOTICE 'Copied claim: %', old_claim_id;
  END LOOP;

  -- ============================================================================
  -- Copy Medications
  -- ============================================================================
  FOR old_med_id IN SELECT id FROM public.medications WHERE user_id = sarah_user_id
  LOOP
    new_med_id := gen_random_uuid();
    medication_id_map := jsonb_set(medication_id_map, ARRAY[old_med_id::text], to_jsonb(new_med_id::text));

    INSERT INTO public.medications (
      id, user_id, pet_id, claim_id,
      medication_name, dosage, frequency, reminder_times,
      start_date, end_date, created_at, updated_at
    )
    SELECT
      new_med_id, david_user_id,
      (pet_id_map->>m.pet_id::text)::UUID,
      CASE WHEN m.claim_id IS NOT NULL THEN (claim_id_map->>m.claim_id::text)::UUID ELSE NULL END,
      medication_name, dosage, frequency, reminder_times,
      start_date, end_date, NOW(), NOW()
    FROM public.medications m WHERE m.id = old_med_id;

    RAISE NOTICE 'Copied medication: %', old_med_id;
  END LOOP;

  -- ============================================================================
  -- Copy Medication Doses
  -- ============================================================================
  INSERT INTO public.medication_doses (id, medication_id, user_id, scheduled_time, given_time, status, created_at)
  SELECT
    gen_random_uuid(),
    (medication_id_map->>md.medication_id::text)::UUID,
    david_user_id,
    scheduled_time, given_time, status, NOW()
  FROM public.medication_doses md WHERE md.user_id = sarah_user_id;

  -- ============================================================================
  -- Copy Medication Reminders Log
  -- ============================================================================
  INSERT INTO public.medication_reminders_log (id, medication_id, user_id, reminder_date, reminder_time, sent_at)
  SELECT
    gen_random_uuid(),
    (medication_id_map->>mrl.medication_id::text)::UUID,
    david_user_id,
    reminder_date, reminder_time, sent_at
  FROM public.medication_reminders_log mrl WHERE mrl.user_id = sarah_user_id;

  -- ============================================================================
  -- Copy SMS Consent
  -- ============================================================================
  INSERT INTO public.sms_consent (id, user_id, phone_number, consented, consent_timestamp, ip_address, consent_text)
  SELECT
    gen_random_uuid(), david_user_id,
    phone_number, consented, consent_timestamp, ip_address, consent_text
  FROM public.sms_consent WHERE user_id = sarah_user_id;

  RAISE NOTICE '================================================================================';
  RAISE NOTICE 'COMPLETE! David Martin account created: david@mybenefitexperience.com';
  RAISE NOTICE '================================================================================';

END $$;
