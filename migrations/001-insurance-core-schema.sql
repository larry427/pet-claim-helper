-- =============================================================================
-- Insurance Core Schema Migration
-- Adds: territories, products, coverages, policy_quotes, policies,
--       endorsements, claim_events, claim_payments, providers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------

create type public.species_type as enum (
  'dog', 'cat', 'bird', 'rabbit', 'reptile', 'small_animal', 'horse', 'other'
);

create type public.policy_status as enum (
  'quote', 'bound', 'active', 'lapsed', 'cancelled', 'expired', 'reinstated'
);

create type public.endorsement_type as enum (
  'add_pet', 'remove_pet', 'coverage_change', 'deductible_change',
  'address_change', 'payment_change', 'cancel', 'reinstate'
);

create type public.claim_event_type as enum (
  'fnol',               -- First Notice of Loss
  'acknowledged',       -- Insurer acknowledged receipt
  'docs_requested',     -- Additional documents requested
  'docs_received',      -- Documents received
  'under_review',       -- Active adjudication
  'approved',           -- Approved for payment
  'partially_approved', -- Partially approved
  'denied',             -- Denied
  'payment_issued',     -- Payment sent
  'closed',             -- Claim closed
  'reopened'            -- Claim reopened
);

create type public.payment_method_type as enum (
  'ach', 'check', 'wire', 'zelle', 'venmo', 'direct_deposit', 'other'
);

create type public.coverage_type as enum (
  'accident_illness',   -- Core A&I
  'accident_only',
  'wellness',
  'dental',
  'prescription',
  'behavioral',
  'alternative_therapy',
  'boarding',           -- Emergency boarding
  'mortality',          -- Horse/exotic: death benefit
  'loss_of_use',        -- Horse: loss of use
  'surgical_only'
);

create type public.provider_type as enum (
  'veterinary_clinic', 'emergency_hospital', 'specialist', 'equine_clinic',
  'equine_hospital', 'rehabilitation', 'telemedicine', 'pharmacy', 'laboratory'
);

-- ---------------------------------------------------------------------------
-- territories
-- Represents a pricing/regulatory region (e.g. US-CA, CA-ON, GB)
-- ---------------------------------------------------------------------------

create table public.territories (
  id              uuid primary key default gen_random_uuid(),
  country         text not null,                    -- ISO 3166-1 alpha-2, e.g. 'US'
  state_province  text,                             -- ISO 3166-2 subdivision code, e.g. 'CA'
  rating_region   text not null,                    -- Internal actuarial region name
  currency        char(3) not null default 'USD',   -- ISO 4217
  tax_rules       jsonb not null default '{}'::jsonb,
  -- e.g. {"premium_tax_pct": 2.35, "stamp_duty": 0, "surcharges": []}
  is_active       boolean not null default true,
  created_at      timestamp with time zone default now(),
  updated_at      timestamp with time zone default now(),

  unique (country, state_province)
);

create index idx_territories_country on public.territories(country);
create index idx_territories_region  on public.territories(rating_region);

-- ---------------------------------------------------------------------------
-- providers
-- Vet/clinic networks, keyed to a territory
-- ---------------------------------------------------------------------------

create table public.providers (
  id              uuid primary key default gen_random_uuid(),
  territory_id    uuid references public.territories(id) on delete set null,
  name            text not null,
  provider_type   public.provider_type not null,
  species_served  public.species_type[] not null default '{}',
  address         text,
  city            text,
  state_province  text,
  country         char(2),
  postal_code     text,
  phone           text,
  email           text,
  npi_number      text,                             -- National Provider Identifier (US)
  network_status  text not null default 'out_of_network'
                    check (network_status in ('in_network','preferred','out_of_network')),
  accepting_new   boolean not null default true,
  coordinates     jsonb,                            -- {"lat": 37.77, "lng": -122.41}
  created_at      timestamp with time zone default now(),
  updated_at      timestamp with time zone default now()
);

create index idx_providers_territory  on public.providers(territory_id);
create index idx_providers_type       on public.providers(provider_type);
create index idx_providers_network    on public.providers(network_status);

-- ---------------------------------------------------------------------------
-- products
-- An insurer's named product offering, tied to a territory + underwriter
-- ---------------------------------------------------------------------------

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  territory_id        uuid not null references public.territories(id),
  name                text not null,
  species_eligibility public.species_type[] not null default '{}',
  underwriter         text not null,                -- e.g. 'Nationwide', 'Trupanion'
  version             text not null default '1.0',  -- form/rate version
  description         text,
  min_pet_age_weeks   integer,
  max_pet_age_years   integer,
  is_active           boolean not null default true,
  effective_date      date,
  expiry_date         date,
  rate_table          jsonb not null default '{}'::jsonb,
  -- actuarial rate factors: {"base_rate": 0.0, "age_factors": {}, "breed_factors": {}}
  created_at          timestamp with time zone default now(),
  updated_at          timestamp with time zone default now()
);

create index idx_products_territory   on public.products(territory_id);
create index idx_products_underwriter on public.products(underwriter);
create index idx_products_active      on public.products(is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- coverages
-- Individual coverage tiers/modules within a product
-- ---------------------------------------------------------------------------

create table public.coverages (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.products(id) on delete cascade,
  coverage_type         public.coverage_type not null,
  label                 text not null,              -- human-readable name
  annual_limit          numeric(12,2),              -- null = unlimited
  sublimits             jsonb not null default '{}'::jsonb,
  -- e.g. {"dental": 500, "alternative_therapy": 250, "exam_fee": 100}
  waiting_period_days   integer not null default 14,
  accident_waiting_days integer not null default 0, -- typically 0 for accidents
  exclusions            text[] not null default '{}',
  -- e.g. ['pre-existing conditions','cosmetic procedures']
  reimbursement_pcts    integer[] not null default '{80}'::integer[],
  -- selectable reimbursement percentages, e.g. {70, 80, 90}
  deductible_options    numeric(10,2)[] not null default '{250}'::numeric[],
  -- selectable annual deductibles
  is_optional           boolean not null default false,
  sort_order            integer not null default 0,
  created_at            timestamp with time zone default now(),
  updated_at            timestamp with time zone default now(),

  unique (product_id, coverage_type)
);

create index idx_coverages_product on public.coverages(product_id);
create index idx_coverages_type    on public.coverages(coverage_type);

-- ---------------------------------------------------------------------------
-- policy_quotes
-- Rating inputs captured at quote time; immutable once bound
-- ---------------------------------------------------------------------------

create table public.policy_quotes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete set null,
  pet_id              uuid references public.pets(id) on delete set null,
  product_id          uuid not null references public.products(id),
  territory_id        uuid not null references public.territories(id),

  -- Rating inputs
  species             public.species_type not null,
  breed               text,
  pet_age_years       numeric(4,2) not null,
  pet_gender          text check (pet_gender in ('male','female','male_neutered','female_spayed','unknown')),
  pet_weight_kg       numeric(6,2),
  zip_code            text,
  is_multi_pet        boolean not null default false,

  -- Selected coverage parameters
  coverage_ids        uuid[] not null default '{}',  -- references coverages.id
  deductible          numeric(10,2) not null,
  reimbursement_pct   integer not null,
  annual_limit        numeric(12,2),

  -- Computed premium breakdown
  base_premium        numeric(10,2),
  territory_factor    numeric(6,4) default 1.0,
  age_factor          numeric(6,4) default 1.0,
  breed_factor        numeric(6,4) default 1.0,
  multi_pet_discount  numeric(6,4) default 0.0,
  tax_amount          numeric(10,2) default 0.0,
  total_premium       numeric(10,2),
  billing_frequency   text not null default 'monthly'
                        check (billing_frequency in ('monthly','quarterly','annual')),

  quote_expires_at    timestamp with time zone default (now() + interval '30 days'),
  is_bound            boolean not null default false,
  created_at          timestamp with time zone default now()
);

create index idx_quotes_user      on public.policy_quotes(user_id);
create index idx_quotes_pet       on public.policy_quotes(pet_id);
create index idx_quotes_product   on public.policy_quotes(product_id);
create index idx_quotes_unbound   on public.policy_quotes(is_bound, quote_expires_at)
  where is_bound = false;

-- ---------------------------------------------------------------------------
-- policies
-- A bound insurance contract
-- ---------------------------------------------------------------------------

create table public.policies (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid references public.policy_quotes(id) on delete set null,
  user_id             uuid not null references public.profiles(id) on delete restrict,
  pet_id              uuid not null references public.pets(id) on delete restrict,
  product_id          uuid not null references public.products(id),
  territory_id        uuid not null references public.territories(id),

  policy_number       text not null unique,
  status              public.policy_status not null default 'bound',

  effective_date      date not null,
  expiry_date         date not null,
  issue_date          date not null default current_date,
  cancel_date         date,
  cancel_reason       text,

  -- Financial terms (snapshot at bind)
  annual_premium      numeric(10,2) not null,
  deductible          numeric(10,2) not null,
  co_insurance        integer not null default 80  -- reimbursement %
                        check (co_insurance between 0 and 100),
  annual_limit        numeric(12,2),               -- null = unlimited
  billing_frequency   text not null default 'monthly'
                        check (billing_frequency in ('monthly','quarterly','annual')),

  -- Accumulated financials (updated as claims are processed)
  deductible_met      numeric(10,2) not null default 0.0,
  limit_used          numeric(12,2) not null default 0.0,

  -- Coverage snapshot (denormalised for audit/portability)
  coverage_snapshot   jsonb not null default '{}'::jsonb,

  created_at          timestamp with time zone default now(),
  updated_at          timestamp with time zone default now(),

  check (expiry_date > effective_date),
  check (deductible_met >= 0),
  check (limit_used >= 0)
);

create index idx_policies_user       on public.policies(user_id);
create index idx_policies_pet        on public.policies(pet_id);
create index idx_policies_status     on public.policies(status);
create index idx_policies_dates      on public.policies(effective_date, expiry_date);
create index idx_policies_number     on public.policies(policy_number);

-- ---------------------------------------------------------------------------
-- endorsements
-- Mid-term policy changes; each creates an immutable audit record
-- ---------------------------------------------------------------------------

create table public.endorsements (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references public.policies(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete restrict,

  endorsement_number  text not null,               -- e.g. 'POL-0001-END-001'
  endorsement_type    public.endorsement_type not null,
  effective_date      date not null,

  -- What changed: before/after snapshots of affected fields
  changes_before      jsonb not null default '{}'::jsonb,
  changes_after       jsonb not null default '{}'::jsonb,

  -- Premium impact
  premium_adjustment  numeric(10,2) not null default 0.0,
  -- positive = additional premium, negative = return premium
  pro_rata_days       integer,                     -- days remaining at endorsement

  notes               text,
  processed_by        text,                        -- staff user or 'system'
  processed_at        timestamp with time zone,
  created_at          timestamp with time zone default now(),

  unique (policy_id, endorsement_number)
);

create index idx_endorsements_policy on public.endorsements(policy_id);
create index idx_endorsements_type   on public.endorsements(endorsement_type);
create index idx_endorsements_date   on public.endorsements(effective_date);

-- ---------------------------------------------------------------------------
-- claim_events
-- Immutable lifecycle ledger for each claim (FNOL → payment issued)
-- ---------------------------------------------------------------------------

create table public.claim_events (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.claims(id) on delete cascade,
  policy_id       uuid references public.policies(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,

  event_type      public.claim_event_type not null,
  occurred_at     timestamp with time zone not null default now(),

  -- Amounts known at this event (nullable until adjudication)
  submitted_amount  numeric(10,2),
  eligible_amount   numeric(10,2),
  deductible_applied numeric(10,2),
  coinsurance_applied numeric(10,2),
  approved_amount   numeric(10,2),

  -- Denial / partial approval details
  denial_reason   text,
  denial_codes    text[] default '{}',

  -- Document attachments at this event
  document_urls   text[] default '{}',

  notes           text,
  actor           text,                            -- adjuster ID, 'system', or 'insured'
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamp with time zone default now()
);

create index idx_claim_events_claim   on public.claim_events(claim_id);
create index idx_claim_events_policy  on public.claim_events(policy_id);
create index idx_claim_events_type    on public.claim_events(event_type);
create index idx_claim_events_time    on public.claim_events(occurred_at);

-- ---------------------------------------------------------------------------
-- claim_payments
-- Actual disbursements tied to a claim (one claim may have multiple payments)
-- ---------------------------------------------------------------------------

create table public.claim_payments (
  id                uuid primary key default gen_random_uuid(),
  claim_id          uuid not null references public.claims(id) on delete cascade,
  claim_event_id    uuid references public.claim_events(id) on delete set null,
  policy_id         uuid not null references public.policies(id) on delete restrict,
  user_id           uuid not null references public.profiles(id) on delete restrict,

  payee_name        text not null,
  payee_type        text not null default 'insured'
                      check (payee_type in ('insured','provider','lienholder')),
  payee_account_ref text,                          -- masked bank/payment ref

  amount            numeric(10,2) not null check (amount > 0),
  currency          char(3) not null default 'USD',
  payment_method    public.payment_method_type not null,

  payment_status    text not null default 'pending'
                      check (payment_status in ('pending','processing','completed','failed','voided')),
  scheduled_date    date,
  issued_date       date,
  cleared_date      date,

  reference_number  text unique,                   -- bank/check/ACH trace number
  notes             text,
  created_at        timestamp with time zone default now(),
  updated_at        timestamp with time zone default now(),

  check (amount > 0)
);

create index idx_payments_claim    on public.claim_payments(claim_id);
create index idx_payments_policy   on public.claim_payments(policy_id);
create index idx_payments_user     on public.claim_payments(user_id);
create index idx_payments_status   on public.claim_payments(payment_status);
create index idx_payments_issued   on public.claim_payments(issued_date);

-- ---------------------------------------------------------------------------
-- RLS: admin-managed reference tables (territories, products, coverages, providers)
-- are readable by all authenticated users; write is service-role only.
-- User-scoped tables follow the same pattern as existing tables.
-- ---------------------------------------------------------------------------

alter table public.territories     enable row level security;
alter table public.providers       enable row level security;
alter table public.products        enable row level security;
alter table public.coverages       enable row level security;
alter table public.policy_quotes   enable row level security;
alter table public.policies        enable row level security;
alter table public.endorsements    enable row level security;
alter table public.claim_events    enable row level security;
alter table public.claim_payments  enable row level security;

-- Reference tables: read-only for authenticated users
create policy "territories_read_auth"  on public.territories  for select to authenticated using (true);
create policy "products_read_auth"     on public.products     for select to authenticated using (true);
create policy "coverages_read_auth"    on public.coverages    for select to authenticated using (true);
create policy "providers_read_auth"    on public.providers    for select to authenticated using (true);

-- policy_quotes: owner access
create policy "quotes_select_own" on public.policy_quotes
  for select using (auth.uid() = user_id);
create policy "quotes_insert_own" on public.policy_quotes
  for insert with check (auth.uid() = user_id);
create policy "quotes_update_own" on public.policy_quotes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- policies: owner access
create policy "policies_select_own" on public.policies
  for select using (auth.uid() = user_id);
create policy "policies_insert_own" on public.policies
  for insert with check (auth.uid() = user_id);
create policy "policies_update_own" on public.policies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- endorsements: owner access
create policy "endorsements_select_own" on public.endorsements
  for select using (auth.uid() = user_id);
create policy "endorsements_insert_own" on public.endorsements
  for insert with check (auth.uid() = user_id);

-- claim_events: owner access
create policy "claim_events_select_own" on public.claim_events
  for select using (auth.uid() = user_id);
create policy "claim_events_insert_own" on public.claim_events
  for insert with check (auth.uid() = user_id);

-- claim_payments: owner access
create policy "claim_payments_select_own" on public.claim_payments
  for select using (auth.uid() = user_id);
create policy "claim_payments_insert_own" on public.claim_payments
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_territories_updated_at
  before update on public.territories
  for each row execute function public.set_updated_at();

create trigger trg_providers_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_coverages_updated_at
  before update on public.coverages
  for each row execute function public.set_updated_at();

create trigger trg_policies_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();

create trigger trg_payments_updated_at
  before update on public.claim_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper view: active policies with coverage summary
-- ---------------------------------------------------------------------------

create view public.v_active_policies as
select
  p.id,
  p.policy_number,
  p.status,
  p.effective_date,
  p.expiry_date,
  p.annual_premium,
  p.deductible,
  p.co_insurance,
  p.annual_limit,
  p.deductible_met,
  p.limit_used,
  p.annual_limit - p.limit_used as limit_remaining,
  pet.name           as pet_name,
  pet.species        as pet_species,
  pr.name            as product_name,
  pr.underwriter,
  t.country,
  t.state_province,
  t.currency
from public.policies p
join public.pets     pet on pet.id = p.pet_id
join public.products pr  on pr.id  = p.product_id
join public.territories t on t.id  = p.territory_id
where p.status = 'active';

-- ---------------------------------------------------------------------------
-- Helper view: claim lifecycle summary
-- ---------------------------------------------------------------------------

create view public.v_claim_lifecycle as
select
  c.id                            as claim_id,
  c.user_id,
  c.pet_id,
  c.service_date,
  c.total_amount                  as submitted_amount,
  c.filing_status,
  -- latest event
  latest.event_type               as current_event,
  latest.occurred_at              as last_activity_at,
  -- payment totals
  coalesce(pay.total_paid, 0)     as total_paid,
  coalesce(pay.payment_count, 0)  as payment_count
from public.claims c
left join lateral (
  select event_type, occurred_at
  from public.claim_events
  where claim_id = c.id
  order by occurred_at desc
  limit 1
) latest on true
left join lateral (
  select sum(amount) as total_paid, count(*) as payment_count
  from public.claim_payments
  where claim_id = c.id and payment_status = 'completed'
) pay on true;
