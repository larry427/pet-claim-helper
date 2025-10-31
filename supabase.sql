-- Enable UUID extension if needed
-- create extension if not exists "uuid-ossp";

-- profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  email_notifications boolean not null default true,
  full_name text,
  phone text,
  address text,
  email_reminders boolean default false,
  weekly_summaries boolean default false,
  deadline_alerts boolean default false,
  default_expense_category text default 'insured',
  default_time_period text default 'all_time',
  insurance_company text,
  filing_deadline_days integer,
  created_at timestamp with time zone default now()
);

-- pets table
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  species text not null,
  color text,
  insurance_company text,
  policy_number text,
  owner_name text,
  owner_address text,
  owner_phone text,
  filing_deadline_days integer not null default 90,
  created_at timestamp with time zone default now()
);

-- claims table (future use)
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  pet_id uuid references public.pets(id) on delete cascade,
  service_date date,
  deadline_date date,
  visit_title text,
  invoice_number text,
  clinic_name text,
  clinic_address text,
  diagnosis text,
  total_amount numeric,
  line_items jsonb,
  filing_status text default 'not_filed',
  filing_deadline_days integer default 90,
  filed_date date,
  approved_date date,
  reimbursed_amount numeric,
  paid_date date,
  visit_notes text,
  created_at timestamp with time zone default now(),
  pdf_path text,
  sent_reminders jsonb default '{}'::jsonb,
  expense_category text not null default 'insured',
  medication_ids jsonb default '[]'::jsonb
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.claims enable row level security;

-- Profiles policies: user can see/update own profile, insert own row
create policy if not exists "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy if not exists "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy if not exists "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Pets policies: only owner can CRUD
create policy if not exists "pets_select_own" on public.pets
  for select using (auth.uid() = user_id);
create policy if not exists "pets_insert_own" on public.pets
  for insert with check (auth.uid() = user_id);
create policy if not exists "pets_update_own" on public.pets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "pets_delete_own" on public.pets
  for delete using (auth.uid() = user_id);

-- Claims policies: only owner can CRUD
create policy if not exists "claims_select_own" on public.claims
  for select using (auth.uid() = user_id);
create policy if not exists "claims_insert_own" on public.claims
  for insert with check (auth.uid() = user_id);
create policy if not exists "claims_update_own" on public.claims
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "claims_delete_own" on public.claims
  for delete using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_claims_user on public.claims(user_id);
create index if not exists idx_claims_service_date on public.claims(service_date);

-- Storage bucket for claim PDFs
insert into storage.buckets (id, name, public)
values ('claim-pdfs', 'claim-pdfs', false)
on conflict (id) do nothing;

-- Policies for claim PDFs bucket
create policy if not exists "claim-pdfs-select-own" on storage.objects
  for select to authenticated
  using (bucket_id = 'claim-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy if not exists "claim-pdfs-insert-own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'claim-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy if not exists "claim-pdfs-delete-own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'claim-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);


-- =============================
-- Medications & Doses tracking
-- =============================

-- medications table
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  pet_id uuid references public.pets(id) on delete cascade not null,
  claim_id uuid references public.claims(id) on delete set null,
  medication_name text not null,
  dosage text,
  frequency text not null check (frequency in ('1x daily','2x daily','3x daily')),
  reminder_times jsonb not null default '[]'::jsonb, -- array of time strings, e.g. ["07:00","19:00"]
  start_date date not null,
  end_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- medication_doses table
create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid references public.medications(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  scheduled_time timestamp with time zone not null,
  given_time timestamp with time zone,
  status text not null default 'pending' check (status in ('pending','given')),
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.medications enable row level security;
alter table public.medication_doses enable row level security;

-- Medications policies (owner-only access)
create policy if not exists "medications_select_own" on public.medications
  for select using (auth.uid() = user_id);
create policy if not exists "medications_insert_own" on public.medications
  for insert with check (auth.uid() = user_id);
create policy if not exists "medications_update_own" on public.medications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "medications_delete_own" on public.medications
  for delete using (auth.uid() = user_id);

-- Medication doses policies (owner-only access)
create policy if not exists "med_doses_select_own" on public.medication_doses
  for select using (auth.uid() = user_id);
create policy if not exists "med_doses_insert_own" on public.medication_doses
  for insert with check (auth.uid() = user_id);
create policy if not exists "med_doses_update_own" on public.medication_doses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "med_doses_delete_own" on public.medication_doses
  for delete using (auth.uid() = user_id);

-- Helpful indexes
create index if not exists idx_medications_user on public.medications(user_id);
create index if not exists idx_medications_pet on public.medications(pet_id);
create index if not exists idx_med_doses_med on public.medication_doses(medication_id);
create index if not exists idx_med_doses_user_time on public.medication_doses(user_id, scheduled_time);

-- Log for sent medication reminders
create table if not exists public.medication_reminders_log (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid references public.medications(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reminder_date date not null,
  reminder_time text not null,
  sent_at timestamp with time zone default now()
);

alter table public.medication_reminders_log enable row level security;
create policy if not exists "med_rem_log_select_own" on public.medication_reminders_log for select using (auth.uid() = user_id);
create policy if not exists "med_rem_log_insert_own" on public.medication_reminders_log for insert with check (auth.uid() = user_id);
create index if not exists idx_med_rem_log_user_date on public.medication_reminders_log(user_id, reminder_date);

