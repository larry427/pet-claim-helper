-- Create medication_reminders_log table
create table if not exists public.medication_reminders_log (
  id uuid default gen_random_uuid() primary key,
  medication_id uuid not null references public.medications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  reminder_time text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.medication_reminders_log enable row level security;

-- RLS policies that ALLOW service role (bypass RLS)
-- Users can only see their own logs
create policy if not exists "Users can view own reminder logs"
  on public.medication_reminders_log
  for select
  using (auth.uid() = user_id);

-- Service role (cron job) can insert logs
-- This policy allows bypassing RLS for service role
create policy if not exists "Service role can insert logs"
  on public.medication_reminders_log
  for insert
  with check (true);

-- Index for performance
create index if not exists idx_med_rem_log_user_date
  on public.medication_reminders_log(user_id, reminder_date);

create index if not exists idx_med_rem_log_medication
  on public.medication_reminders_log(medication_id, reminder_date, reminder_time);
