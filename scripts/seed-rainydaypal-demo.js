#!/usr/bin/env node
/**
 * Seed script: RainyDayPal CEO demo account (Zaydoon Munir)
 *
 * Creates a fully-populated demo account for sales demos:
 *   Email:    demo-rainydaypal@petclaimhelper.com
 *   Password: RainyDay2026!
 *   Persona:  Sarah Mitchell
 *
 * Pets:  Max (Golden Retriever · Pumpkin)  +  Luna (DSH Cat · Spot)
 * Bills: 4 vet claims across 3 statuses — one ready for live auto-submit demo
 * Expenses: 11 total (4 vet_medical linked to claims + 7 non-medical)
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Returns the full Supabase result { data, error } after asserting no error,
// so callers can destructure: const { data: x } = await must(...)
async function must(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result
}

// ─── main ────────────────────────────────────────────────────────────────────

async function seedRainyDayPalDemo() {
  console.log('\n🐾  Creating RainyDayPal demo account…\n')

  // ── 1. Auth user ────────────────────────────────────────────────────────────
  const DEMO_EMAIL    = 'demo-rainydaypal@petclaimhelper.com'
  const DEMO_PASSWORD = 'RainyDay2026!'

  // Check if account already exists and nuke it so we can re-run safely
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existing = existingUsers?.users?.find(u => u.email === DEMO_EMAIL)
  if (existing) {
    console.log('⚠️  Account already exists — deleting and recreating…')
    await supabase.auth.admin.deleteUser(existing.id)
  }

  const { data: authData } = await must('createUser', await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,          // skip verification email
  }))
  const userId = authData.user.id
  console.log('✅  Auth user created:', userId)

  // ── 2. Profile ───────────────────────────────────────────────────────────────
  await must('profile', await supabase.from('profiles').upsert({
    id:                    userId,
    email:                 DEMO_EMAIL,
    full_name:             'Sarah Mitchell',
    phone:                 '(503) 847-2031',
    address:               '1847 Maple Grove Drive',
    city:                  'Portland',
    state:                 'OR',
    zip:                   '97201',
    is_demo_account:       true,
    onboarding_complete:   true,
    default_expense_category: 'insured',
  }))
  console.log('✅  Profile created: Sarah Mitchell (Portland, OR)')

  // ── 3. Max — Golden Retriever, Pumpkin ───────────────────────────────────────
  const { data: maxData } = await must('pet:Max', await supabase.from('pets').insert({
    user_id:                 userId,
    name:                    'Max',
    species:                 'dog',
    breed:                   'Golden Retriever',
    gender:                  'male',
    insurance_company:       'Pumpkin',
    policy_number:           'PK-2024-78432',
    pumpkin_account_number:  'PK-2024-78432',
    filing_deadline_days:    270,            // Pumpkin: 270-day filing window
  }).select().single())
  const maxId = maxData.id
  console.log('✅  Pet: Max (Golden Retriever · Pumpkin PK-2024-78432)')

  // ── 4. Luna — Domestic Shorthair, Spot ───────────────────────────────────────
  const { data: lunaData } = await must('pet:Luna', await supabase.from('pets').insert({
    user_id:              userId,
    name:                 'Luna',
    species:              'cat',
    breed:                'Domestic Shorthair',
    gender:               'female',
    insurance_company:    'Spot',
    policy_number:        'SP-2023-91256',
    spot_account_number:  'SP-2023-91256',
    filing_deadline_days: 270,               // Spot: 270-day filing window
  }).select().single())
  const lunaId = lunaData.id
  console.log('✅  Pet: Luna (Domestic Shorthair Cat · Spot SP-2023-91256)')

  // ─────────────────────────────────────────────────────────────────────────────
  // VET CLAIMS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── 5. Max – Emergency GI Visit (PAID · reimbursed $678) ──────────────────────
  //    filing_status: 'paid' so FinancialSummary counts the $678 reimbursement
  const GI_DATE = '2025-11-15'
  const { data: maxGI } = await must('claim:MaxGI', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               maxId,
    visit_title:          'Emergency GI Visit',
    clinic_name:          'BluePearl Emergency Pet Hospital',
    service_date:         GI_DATE,
    total_amount:         847.00,
    reimbursed_amount:    678.00,
    filing_status:        'paid',            // ← 'paid' so reimbursement is counted
    filing_deadline_days: 270,
    filed_date:           '2025-11-20',
    approved_date:        '2025-12-05',
    paid_date:            '2025-12-10',
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

  // ── 6. Max – Annual Wellness (not insured — wellness exclusion) ───────────────
  const WELL_DATE = '2025-10-20'
  const { data: maxWell } = await must('claim:MaxWellness', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               maxId,
    visit_title:          'Annual Wellness Exam',
    clinic_name:          'VCA Animal Hospital',
    service_date:         WELL_DATE,
    total_amount:         285.00,
    filing_status:        'not_filed',
    filing_deadline_days: 270,
    expense_category:     'not_insured',    // wellness exclusion — not covered
    diagnosis:            'Annual wellness exam — routine preventive care',
    line_items: [
      { description: 'Wellness exam',   amount: 65  },
      { description: 'Vaccines',        amount: 120 },
      { description: 'Heartworm test',  amount: 45  },
      { description: 'Fecal test',      amount: 55  },
    ],
  }).select().single())

  await must('expense:MaxWellness', await supabase.from('pet_expenses').insert({
    user_id:      userId,
    amount:       285.00,
    category:     'vet_medical',
    expense_date: WELL_DATE,
    vendor:       'VCA Animal Hospital',
    description:  'Annual Wellness Exam',
    claim_id:     maxWell.id,
  }))
  console.log('✅  Claim: Max – Annual Wellness     ($285 · not insured / wellness exclusion)')

  // ── 7. Luna – Dental Cleaning (filed · pending reimbursement) ────────────────
  const DENTAL_DATE = '2025-12-08'
  const { data: lunaDental } = await must('claim:LunaDental', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               lunaId,
    visit_title:          'Dental Cleaning',
    clinic_name:          'Banfield Pet Hospital',
    service_date:         DENTAL_DATE,
    total_amount:         520.00,
    filing_status:        'filed',
    filing_deadline_days: 270,
    filed_date:           '2025-12-15',
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
  console.log('✅  Claim: Luna – Dental Cleaning    ($520 · filed 12/15 · pending reimbursement)')

  // ── 8. Luna – UTI Treatment (NOT submitted — ready for live auto-submit demo) ─
  const UTI_DATE = '2026-02-10'
  const { data: lunaUTI } = await must('claim:LunaUTI', await supabase.from('claims').insert({
    user_id:              userId,
    pet_id:               lunaId,
    visit_title:          'UTI Treatment',
    clinic_name:          'VCA Animal Hospital',
    service_date:         UTI_DATE,
    total_amount:         312.00,
    filing_status:        'not_submitted',   // ← LIVE DEMO bill
    filing_deadline_days: 270,
    expense_category:     'insured',
    diagnosis:            'Feline lower urinary tract disease (FLUTD) — bacterial UTI',
    line_items: [
      { description: 'Sick exam',                           amount: 65 },
      { description: 'Urinalysis',                          amount: 85 },
      { description: 'Antibiotics (amoxicillin-clavulanate)', amount: 42 },
      { description: 'Follow-up urinalysis',                amount: 55 },
      { description: 'Prescription urinary food',           amount: 65 },
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
  console.log('✅  Claim: Luna – UTI Treatment      ($312 · NOT SUBMITTED — live demo bill)')

  // ─────────────────────────────────────────────────────────────────────────────
  // NON-MEDICAL EXPENSES
  // ─────────────────────────────────────────────────────────────────────────────

  const nonMedicalExpenses = [
    // food_treats
    {
      user_id:      userId,
      amount:       89.99,
      category:     'food_treats',
      expense_date: '2026-02-01',
      vendor:       'Chewy',
      description:  'Max – Monthly kibble delivery',
    },
    {
      user_id:      userId,
      amount:       45.50,
      category:     'food_treats',
      expense_date: '2026-02-15',
      vendor:       'Petco',
      description:  'Luna – Cat food + litter',
    },
    // grooming
    {
      user_id:      userId,
      amount:       75.00,
      category:     'grooming',
      expense_date: '2026-01-20',
      vendor:       'PetSmart Grooming',
      description:  'Max – Bath + nail trim',
    },
    // supplies_gear
    {
      user_id:      userId,
      amount:       34.99,
      category:     'supplies_gear',
      expense_date: '2026-01-10',
      vendor:       'Amazon',
      description:  'Max – New leash + collar',
    },
    {
      user_id:      userId,
      amount:       28.50,
      category:     'supplies_gear',
      expense_date: '2025-12-25',
      vendor:       'Chewy',
      description:  'Luna – Cat tree replacement parts',
    },
    // training_boarding
    {
      user_id:      userId,
      amount:       150.00,
      category:     'training_boarding',
      expense_date: '2026-02-08',
      vendor:       'Sit Means Sit',
      description:  'Max – Group class (4 sessions)',
    },
    {
      user_id:      userId,
      amount:       245.00,
      category:     'training_boarding',
      expense_date: '2025-11-15',
      vendor:       'Camp Bow Wow',
      description:  'Max – Boarding (Thanksgiving trip)',
    },
  ]

  await must('expenses:nonMedical', await supabase.from('pet_expenses').insert(nonMedicalExpenses))
  console.log('✅  7 non-medical expenses inserted:')
  console.log('      Food & Treats:       Max Chewy $89.99  ·  Luna Petco $45.50')
  console.log('      Grooming:            Max PetSmart $75.00')
  console.log('      Supplies & Gear:     Max Amazon $34.99  ·  Luna Chewy $28.50')
  console.log('      Training/Boarding:   Max Sit Means Sit $150  ·  Max Camp Bow Wow $245')

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  const LINE = '═'.repeat(58)
  const THIN = '─'.repeat(58)

  // Vet claims
  const vetTotal     = 847 + 285 + 520 + 312                // $1,964
  const reimbursed   = 678                                    // Max GI (paid)
  const pendingReimb = 520                                    // Luna Dental (filed)

  // Non-medical
  const foodTotal     = 89.99 + 45.50                        // $135.49
  const groomTotal    = 75.00                                 // $75.00
  const suppliesTotal = 34.99 + 28.50                        // $63.49
  const trainingTotal = 150.00 + 245.00                      // $395.00
  const nonMedTotal   = foodTotal + groomTotal + suppliesTotal + trainingTotal  // $668.98

  const grandTotal = vetTotal + nonMedTotal                  // $2,632.98

  console.log('\n' + LINE)
  console.log('  🎉  RAINYDAYPAL DEMO ACCOUNT READY')
  console.log(LINE)
  console.log(`  Email:    ${DEMO_EMAIL}`)
  console.log(`  Password: ${DEMO_PASSWORD}`)
  console.log(`  Persona:  Sarah Mitchell  ·  Portland, OR`)
  console.log(THIN)
  console.log(`  Max   Golden Retriever  ·  Pumpkin  ·  PK-2024-78432`)
  console.log(`  Luna  Domestic Shorthair Cat  ·  Spot  ·  SP-2023-91256`)
  console.log(THIN)
  console.log(`  VET BILLS`)
  console.log(`    Total vet expenses:      $${vetTotal.toLocaleString()}`)
  console.log(`    Total reimbursed:        $${reimbursed}  (Max GI — paid)`)
  console.log(`    Pending reimbursement:   $${pendingReimb}  (Luna Dental — filed)`)
  console.log(`    Claims filed:            2  (Max GI + Luna Dental)`)
  console.log(`    Bills pending:           1  (Max Wellness — not insured)`)
  console.log(THIN)
  console.log(`  NON-MEDICAL EXPENSES`)
  console.log(`    Food & Treats:           $${foodTotal.toFixed(2)}`)
  console.log(`    Grooming:                $${groomTotal.toFixed(2)}`)
  console.log(`    Supplies & Gear:         $${suppliesTotal.toFixed(2)}`)
  console.log(`    Training & Boarding:     $${trainingTotal.toFixed(2)}`)
  console.log(`    Subtotal non-medical:    $${nonMedTotal.toFixed(2)}`)
  console.log(THIN)
  console.log(`  Grand total all expenses:  $${grandTotal.toFixed(2)}`)
  console.log(THIN)
  console.log(`  ★ DEMO BILL  Luna UTI $312 — submit live during demo!`)
  console.log(LINE)
  console.log(`  Deadlines (270 days):`)
  console.log(`    Max GI       ${GI_DATE}  →  ${addDays(GI_DATE, 270)}`)
  console.log(`    Luna Dental  ${DENTAL_DATE}  →  ${addDays(DENTAL_DATE, 270)}`)
  console.log(`    Luna UTI     ${UTI_DATE}  →  ${addDays(UTI_DATE, 270)}`)
  console.log(LINE + '\n')

  process.exit(0)
}

seedRainyDayPalDemo().catch(err => {
  console.error('\n❌ ', err.message)
  process.exit(1)
})
