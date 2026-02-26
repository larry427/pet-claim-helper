#!/usr/bin/env node
/**
 * Seed script: RainyDayPal CEO demo account
 *
 * Creates a fully-populated demo account for sales demos:
 *   Email:    demo-rainydaypal@petclaimhelper.com
 *   Password: RainyDay2026!
 *   Persona:  Sarah Mitchell · Portland, OR
 *
 * Pets:  Max (Golden Retriever · Pumpkin)
 *        Luna (DSH Cat · Spot)
 *        Bo (Labrador Mix · no insurance)
 *
 * Vet bills: 4 claims across 3 statuses — Luna UTI ready for live auto-submit
 * Expenses: Dec 2025 + Jan 2026 + Feb 2026 with realistic detail
 *
 * Usage:
 *   node scripts/seed-rainydaypal-demo.js
 *   npm run seed:rainydaypal
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function must(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result
}

async function seedRainyDayPalDemo() {
  console.log('\n🐾  Creating RainyDayPal demo account…\n')

  // ── 1. Auth user ──────────────────────────────────────────────────────────────
  const DEMO_EMAIL    = 'demo-rainydaypal@petclaimhelper.com'
  const DEMO_PASSWORD = 'RainyDay2026!'

  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existing = existingUsers?.users?.find(u => u.email === DEMO_EMAIL)
  if (existing) {
    console.log('⚠️  Account already exists — deleting and recreating…')
    await supabase.auth.admin.deleteUser(existing.id)
  }

  const { data: authData } = await must('createUser', await supabase.auth.admin.createUser({
    email:         DEMO_EMAIL,
    password:      DEMO_PASSWORD,
    email_confirm: true,
  }))
  const userId = authData.user.id
  console.log('✅  Auth user created:', userId)

  // ── 2. Profile ────────────────────────────────────────────────────────────────
  await must('profile', await supabase.from('profiles').upsert({
    id:                       userId,
    email:                    DEMO_EMAIL,
    full_name:                'Sarah Mitchell',
    phone:                    '(503) 847-2031',
    address:                  '1847 Maple Grove Drive',
    city:                     'Portland',
    state:                    'OR',
    zip:                      '97201',
    is_demo_account:          true,
    onboarding_complete:      true,
    default_expense_category: 'insured',
  }))
  console.log('✅  Profile: Sarah Mitchell (Portland, OR)')

  // ── 3. Pets ───────────────────────────────────────────────────────────────────
  const { data: maxData } = await must('pet:Max', await supabase.from('pets').insert({
    user_id:                userId,
    name:                   'Max',
    species:                'dog',
    breed:                  'Golden Retriever',
    gender:                 'male',
    insurance_company:      'Pumpkin',
    policy_number:          'PK-2024-78432',
    pumpkin_account_number: 'PK-2024-78432',
    filing_deadline_days:   270,
  }).select().single())
  const maxId = maxData.id
  console.log('✅  Pet: Max (Golden Retriever · Pumpkin PK-2024-78432)')

  const { data: lunaData } = await must('pet:Luna', await supabase.from('pets').insert({
    user_id:             userId,
    name:                'Luna',
    species:             'cat',
    breed:               'Domestic Shorthair',
    gender:              'female',
    insurance_company:   'Spot',
    policy_number:       'SP-2023-91256',
    spot_account_number: 'SP-2023-91256',
    filing_deadline_days: 270,
  }).select().single())
  const lunaId = lunaData.id
  console.log('✅  Pet: Luna (Domestic Shorthair Cat · Spot SP-2023-91256)')

  const { data: boData } = await must('pet:Bo', await supabase.from('pets').insert({
    user_id:  userId,
    name:     'Bo',
    species:  'dog',
    breed:    'Labrador Mix',
    gender:   'male',
    // no insurance
  }).select().single())
  const boId = boData.id
  console.log('✅  Pet: Bo (Labrador Mix · no insurance)')

  // ── 4. Vet claims ─────────────────────────────────────────────────────────────

  // Max – BluePearl Emergency GI (PAID · reimbursed $678)
  const GI_DATE = '2025-12-15'
  const { data: maxGI } = await must('claim:MaxGI', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               maxId,
    visit_title:          'Emergency GI Visit',
    clinic_name:          'BluePearl Emergency Pet Hospital',
    service_date:         GI_DATE,
    total_amount:         847.00,
    reimbursed_amount:    678.00,
    filing_status:        'paid',
    filing_deadline_days: 270,
    filed_date:           '2025-12-18',
    approved_date:        '2025-12-19',
    paid_date:            '2025-12-20',
    expense_category:     'insured',
    diagnosis:            'Gastrointestinal distress — suspected foreign body ingestion',
    line_items: [
      { description: 'Emergency exam',    amount: 95  },
      { description: 'X-rays',            amount: 285 },
      { description: 'IV fluids',         amount: 175 },
      { description: 'Cerenia injection', amount: 45  },
      { description: 'Metronidazole',     amount: 32  },
      { description: 'Follow-up',         amount: 215 },
    ],
  }).select().single())
  await must('expense:MaxGI', await supabase.from('pet_expenses').insert({
    user_id:      userId,
    amount:       847.00,
    category:     'vet_medical',
    expense_date: GI_DATE,
    vendor:       'BluePearl Emergency Pet Hospital',
    description:  'Emergency GI Visit',
    claim_id:     maxGI.id,
  }))
  console.log('✅  Claim: Max – Emergency GI Visit  ($847 · PAID · $678 reimbursed)')

  // Luna – Banfield Dental Cleaning (FILED · pending reimbursement)
  const DENTAL_DATE = '2025-12-18'
  const { data: lunaDental } = await must('claim:LunaDental', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               lunaId,
    visit_title:          'Dental Cleaning',
    clinic_name:          'Banfield Pet Hospital',
    service_date:         DENTAL_DATE,
    total_amount:         520.00,
    filing_status:        'filed',
    filing_deadline_days: 270,
    filed_date:           '2025-12-22',
    expense_category:     'insured',
    diagnosis:            'Stage 2 periodontal disease — tooth resorption',
    line_items: [
      { description: 'Dental exam',      amount: 55  },
      { description: 'Anesthesia',       amount: 180 },
      { description: 'Dental cleaning',  amount: 185 },
      { description: 'Tooth extraction', amount: 100 },
    ],
  }).select().single())
  await must('expense:LunaDental', await supabase.from('pet_expenses').insert({
    user_id:      userId,
    amount:       520.00,
    category:     'vet_medical',
    expense_date: DENTAL_DATE,
    vendor:       'Banfield Pet Hospital',
    description:  'Dental Cleaning',
    claim_id:     lunaDental.id,
  }))
  console.log('✅  Claim: Luna – Dental Cleaning    ($520 · filed 12/22 · pending reimbursement)')

  // Bo – VCA Wellness Exam (SELF-PAY · Bo has no insurance)
  const BO_WELL_DATE = '2026-01-22'
  const { data: boWell } = await must('claim:BoWellness', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               boId,
    visit_title:          'Annual Wellness Exam',
    clinic_name:          'VCA Animal Hospital',
    service_date:         BO_WELL_DATE,
    total_amount:         285.00,
    filing_status:        'not_submitted',
    filing_deadline_days: 270,
    expense_category:     'not_insured',
    diagnosis:            'Annual wellness exam — routine preventive care',
    line_items: [
      { description: 'Wellness exam',  amount: 65  },
      { description: 'Vaccines',       amount: 120 },
      { description: 'Heartworm test', amount: 45  },
      { description: 'Fecal test',     amount: 55  },
    ],
  }).select().single())
  await must('expense:BoWellness', await supabase.from('pet_expenses').insert({
    user_id:      userId,
    amount:       285.00,
    category:     'vet_medical',
    expense_date: BO_WELL_DATE,
    vendor:       'VCA Animal Hospital',
    description:  'Annual Wellness Exam',
    claim_id:     boWell.id,
  }))
  console.log('✅  Claim: Bo – Annual Wellness       ($285 · self-pay · no insurance)')

  // Luna – VCA UTI Treatment (NOT SUBMITTED — live demo Auto-Submit bill)
  const UTI_DATE = '2026-02-10'
  const { data: lunaUTI } = await must('claim:LunaUTI', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               lunaId,
    visit_title:          'UTI Treatment',
    clinic_name:          'VCA Animal Hospital',
    service_date:         UTI_DATE,
    total_amount:         312.00,
    filing_status:        'not_submitted',
    filing_deadline_days: 270,
    expense_category:     'insured',
    diagnosis:            'Feline lower urinary tract disease (FLUTD) — bacterial UTI',
    line_items: [
      { description: 'Sick exam',                              amount: 65 },
      { description: 'Urinalysis',                             amount: 85 },
      { description: 'Antibiotics (amoxicillin-clavulanate)',  amount: 42 },
      { description: 'Follow-up urinalysis',                   amount: 55 },
      { description: 'Prescription urinary food',              amount: 65 },
    ],
  }).select().single())
  await must('expense:LunaUTI', await supabase.from('pet_expenses').insert({
    user_id:      userId,
    amount:       312.00,
    category:     'vet_medical',
    expense_date: UTI_DATE,
    vendor:       'VCA Animal Hospital',
    description:  'UTI Treatment',
    claim_id:     lunaUTI.id,
  }))
  console.log('✅  Claim: Luna – UTI Treatment       ($312 · NOT SUBMITTED — live demo bill)')

  // ── 5. Non-medical expenses ───────────────────────────────────────────────────

  const nonMedical = [
    // ── December 2025 ──
    { user_id: userId, amount: 89.99,  category: 'food_treats',        expense_date: '2025-12-02', vendor: 'Chewy',            description: 'Max – Monthly kibble delivery' },
    { user_id: userId, amount: 45.50,  category: 'food_treats',        expense_date: '2025-12-08', vendor: 'Petco',            description: 'Luna – Cat food + litter' },
    { user_id: userId, amount: 28.50,  category: 'food_treats',        expense_date: '2025-12-25', vendor: 'Chewy',            description: 'Bo – Dog treats variety pack' },
    // ── January 2026 ──
    { user_id: userId, amount: 89.99,  category: 'food_treats',        expense_date: '2026-01-02', vendor: 'Chewy',            description: 'Max – Monthly kibble delivery' },
    { user_id: userId, amount: 45.50,  category: 'food_treats',        expense_date: '2026-01-15', vendor: 'Petco',            description: 'Luna – Cat food + litter' },
    { user_id: userId, amount: 34.99,  category: 'supplies_gear',      expense_date: '2026-01-10', vendor: 'Amazon',           description: 'Bo – New leash + collar' },
    { user_id: userId, amount: 75.00,  category: 'grooming',           expense_date: '2026-01-20', vendor: 'PetSmart Grooming', description: 'Max – Bath + nail trim' },
    // ── February 2026 ──
    { user_id: userId, amount: 89.99,  category: 'food_treats',        expense_date: '2026-02-01', vendor: 'Chewy',            description: 'Max – Monthly kibble delivery' },
    { user_id: userId, amount: 45.50,  category: 'food_treats',        expense_date: '2026-02-15', vendor: 'Petco',            description: 'Luna – Cat food + litter' },
    { user_id: userId, amount: 150.00, category: 'training_boarding',  expense_date: '2026-02-08', vendor: 'Sit Means Sit',    description: 'Max – Group class (4 sessions)' },
    { user_id: userId, amount: 195.00, category: 'training_boarding',  expense_date: '2026-02-05', vendor: 'Camp Bow Wow',     description: 'Bo – Boarding (3 nights)' },
  ]

  await must('expenses:nonMedical', await supabase.from('pet_expenses').insert(nonMedical))
  console.log('✅  11 non-medical expenses inserted:')
  console.log('      Dec 2025:  Max Chewy $89.99  ·  Luna Petco $45.50  ·  Bo Chewy $28.50')
  console.log('      Jan 2026:  Max Chewy $89.99  ·  Luna Petco $45.50  ·  Bo Amazon $34.99  ·  Max PetSmart $75')
  console.log('      Feb 2026:  Max Chewy $89.99  ·  Luna Petco $45.50  ·  Max Sit Means Sit $150  ·  Bo Camp Bow Wow $195')

  // ── Summary ───────────────────────────────────────────────────────────────────
  const LINE = '═'.repeat(58)
  const THIN = '─'.repeat(58)

  const vetTotal      = 847 + 520 + 285 + 312   // $1,964
  const reimbursed    = 678                       // Max GI (paid)
  const pendingReimb  = 520                       // Luna Dental (filed)

  const dec25food     = 89.99 + 45.50 + 28.50   // $163.99
  const jan26food     = 89.99 + 45.50            // $135.49
  const jan26other    = 34.99 + 75.00            // $109.99
  const feb26food     = 89.99 + 45.50            // $135.49
  const feb26other    = 150.00 + 195.00          // $345.00
  const nonMedTotal   = dec25food + jan26food + jan26other + feb26food + feb26other  // $889.96

  const grandTotal    = vetTotal + nonMedTotal   // $2,853.96

  console.log('\n' + LINE)
  console.log('  🎉  RAINYDAYPAL DEMO ACCOUNT READY')
  console.log(LINE)
  console.log(`  Email:    ${DEMO_EMAIL}`)
  console.log(`  Password: ${DEMO_PASSWORD}`)
  console.log(`  Persona:  Sarah Mitchell  ·  Portland, OR`)
  console.log(THIN)
  console.log(`  Max   Golden Retriever   ·  Pumpkin  ·  PK-2024-78432`)
  console.log(`  Luna  Domestic Shorthair ·  Spot     ·  SP-2023-91256`)
  console.log(`  Bo    Labrador Mix       ·  (no insurance)`)
  console.log(THIN)
  console.log(`  VET BILLS`)
  console.log(`    Max  BluePearl GI      $847  PAID  ($678 reimbursed · Dec 20)`)
  console.log(`    Luna Banfield Dental   $520  FILED (pending · filed Dec 22)`)
  console.log(`    Bo   VCA Wellness      $285  SELF-PAY`)
  console.log(`    Luna VCA UTI           $312  NOT SUBMITTED ← live demo`)
  console.log(`    Total vet:             $${vetTotal.toLocaleString()}`)
  console.log(`    Reimbursed:            $${reimbursed}`)
  console.log(`    Pending reimbursement: $${pendingReimb}`)
  console.log(THIN)
  console.log(`  NON-MEDICAL EXPENSES`)
  console.log(`    Dec 2025 (food/treats):         $${dec25food.toFixed(2)}`)
  console.log(`    Jan 2026 (food/gear/grooming):  $${(jan26food + jan26other).toFixed(2)}`)
  console.log(`    Feb 2026 (food/training):       $${(feb26food + feb26other).toFixed(2)}`)
  console.log(`    Subtotal non-medical:           $${nonMedTotal.toFixed(2)}`)
  console.log(THIN)
  console.log(`  Grand total all expenses:  $${grandTotal.toFixed(2)}`)
  console.log(THIN)
  console.log(`  ★ DEMO BILL  Luna UTI $312 — submit live during demo!`)
  console.log(LINE)
  console.log(`  Filing deadlines (270 days):`)
  console.log(`    Max GI       ${GI_DATE}  →  ${addDays(GI_DATE, 270)}`)
  console.log(`    Luna Dental  ${DENTAL_DATE}  →  ${addDays(DENTAL_DATE, 270)}`)
  console.log(`    Bo Wellness  ${BO_WELL_DATE}  →  ${addDays(BO_WELL_DATE, 270)}`)
  console.log(`    Luna UTI     ${UTI_DATE}    →  ${addDays(UTI_DATE, 270)}`)
  console.log(LINE + '\n')

  process.exit(0)
}

seedRainyDayPalDemo().catch(err => {
  console.error('\n❌ ', err.message)
  process.exit(1)
})
