#!/usr/bin/env node
/**
 * scripts/seed.js
 *
 * Bulk seed script for the pet insurance analytics schema.
 * Inserts via pg (direct Postgres connection) with batched multi-row INSERTs.
 *
 * Targets:
 *   6–10  territories
 *   12–20 products + coverages
 *   50k   profiles (no auth.users required — analytics only)
 *   80k   pets
 *   100k  claims + claim_events + claim_payments
 *
 * Run:
 *   node scripts/seed.js
 *   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/seed.js
 */

import pg from 'pg'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config({ path: join(__dirname, '..', 'server', '.env.local') })

const DB_URL =
  process.env.DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const { Pool } = pg
const pool = new Pool({ connectionString: DB_URL, max: 5 })

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const uuid = () => crypto.randomUUID()

/** Seeded PRNG — reproducible runs */
let _seed = 42
function rand() {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff
  return ((_seed >>> 0) / 0xffffffff)
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min }
function pick(arr) { return arr[randInt(0, arr.length - 1)] }
function weighted(items) {
  // items: [{value, weight}, ...]
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = rand() * total
  for (const item of items) { r -= item.weight; if (r <= 0) return item.value }
  return items[items.length - 1].value
}
function randDate(start, end) {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  return new Date(s + rand() * (e - s)).toISOString().slice(0, 10)
}
function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Insert rows in batches, returns inserted count */
async function batchInsert(client, table, columns, rows, batchSize = 500) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const placeholders = batch.map(
      (_, ri) => `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(',')})`
    ).join(',')
    const values = batch.flatMap(r => columns.map(c => r[c]))
    await client.query(
      `INSERT INTO public.${table} (${columns.join(',')}) VALUES ${placeholders}`,
      values
    )
    inserted += batch.length
  }
  return inserted
}

function progress(label, n, total) {
  process.stdout.write(`\r  ${label}: ${n.toLocaleString()} / ${total.toLocaleString()}`)
  if (n >= total) console.log()
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara',
  'David','Elizabeth','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen',
  'Christopher','Lisa','Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra',
  'Donald','Ashley','Steven','Dorothy','Paul','Kimberly','Andrew','Emily','Kenneth','Donna',
  'Joshua','Michelle','Kevin','Carol','Brian','Amanda','George','Melissa','Edward','Deborah',
  'Ronald','Stephanie','Timothy','Rebecca','Jason','Sharon','Jeffrey','Laura','Ryan','Cynthia',
  'Jacob','Kathleen','Gary','Amy','Nicholas','Angela','Eric','Shirley','Jonathan','Anna',
  'Stephen','Brenda','Larry','Pamela','Justin','Emma','Scott','Nicole','Brandon','Helen',
  'Benjamin','Samantha','Samuel','Katherine','Raymond','Christine','Gregory','Debra','Frank','Rachel',
  'Alexander','Carolyn','Patrick','Janet','Jack','Catherine','Dennis','Maria','Jerry','Heather',
]
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
  'Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes',
  'Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper',
  'Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
  'Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes',
  'Price','Alvarez','Castillo','Sanders','Patel','Myers','Long','Ross','Foster','Jimenez',
]

const DOG_BREEDS = [
  'Labrador Retriever','German Shepherd','Golden Retriever','French Bulldog','Bulldog',
  'Poodle','Beagle','Rottweiler','German Shorthaired Pointer','Yorkshire Terrier',
  'Boxer','Dachshund','Siberian Husky','Doberman Pinscher','Australian Shepherd',
  'Great Dane','Miniature Schnauzer','Cavalier King Charles Spaniel','Shih Tzu','Boston Terrier',
  'Bernese Mountain Dog','Pomeranian','Havanese','Shetland Sheepdog','Brittany Spaniel',
  'English Springer Spaniel','Pembroke Welsh Corgi','Vizsla','Cocker Spaniel','Border Collie',
  'Mixed Breed','Pitbull Mix','Chihuahua','Maltese','Weimaraner',
]
const CAT_BREEDS = [
  'Domestic Shorthair','Domestic Longhair','Maine Coon','Ragdoll','Bengal',
  'Siamese','Abyssinian','Russian Blue','Birman','American Shorthair',
  'Scottish Fold','Sphynx','Persian','Norwegian Forest Cat','Devon Rex',
  'Burmese','Tonkinese','Turkish Angora','Himalayan','Exotic Shorthair',
]
const HORSE_BREEDS = [
  'Thoroughbred','Quarter Horse','Arabian','Paint Horse','Appaloosa',
  'Warmblood','Standardbred','Morgan','Tennessee Walking Horse','Mustang',
  'Andalusian','Friesian','Clydesdale','Hanoverian','Dutch Warmblood',
]

const DIAGNOSES = {
  dog: [
    'Otitis externa','Skin allergy - atopic dermatitis','Luxating patella','Hip dysplasia',
    'Intervertebral disc disease','Cruciate ligament tear','Gastroenteritis','Pancreatitis',
    'Urinary tract infection','Dental disease - periodontal','Foreign body ingestion',
    'Hypothyroidism','Diabetes mellitus','Conjunctivitis','Lacerations - soft tissue',
    'Kennel cough - Bordetella','Heartworm disease','Degenerative joint disease',
    'Mast cell tumor','Lipoma','Pyoderma - bacterial skin infection','Bloat - GDV',
    'Cataracts','Epilepsy - idiopathic','Cushing syndrome','Cancer - lymphoma',
  ],
  cat: [
    'Urinary tract infection','Feline lower urinary tract disease','Hyperthyroidism',
    'Chronic kidney disease','Dental disease - gingivitis','Upper respiratory infection',
    'Skin allergy','Inflammatory bowel disease','Diabetes mellitus','Pancreatitis',
    'Conjunctivitis','Ear mites','Ringworm - dermatophytosis','Vomiting - hairballs',
    'Fracture - trauma','Abscess - bite wound','Feline leukemia','Lymphoma',
    'Asthma - feline','Hypertrophic cardiomyopathy',
  ],
  horse: [
    'Colic - gas','Colic - impaction','Laminitis','Navicular syndrome',
    'Tendon injury - superficial flexor','Suspensory ligament desmitis',
    'Equine influenza','Strangles - Streptococcus equi','Cellulitis - lower limb',
    'Wound laceration','Uveitis - equine recurrent','EPM - neurological',
    'Rain rot - dermatophilosis','Thrush - hoof','Joint injection - hock osteoarthritis',
    'Fracture - cannon bone','Colic - surgical','PPID - Cushings equine',
  ],
}
const CLINIC_NAMES = [
  'Animal Care Center','Paws & Claws Veterinary','Main Street Animal Hospital',
  'Blue Cross Pet Clinic','Riverside Veterinary Group','Sunshine Animal Hospital',
  'Mountain View Pet Care','Lakeside Vet Clinic','Central Park Animal Hospital',
  'Happy Tails Veterinary','Premier Pet Health','Valley Animal Medical Center',
  'Northside Veterinary Clinic','Heritage Animal Hospital','Coastal Pet Care',
  'Greenfield Veterinary Associates','Summit Animal Hospital','Cedar Grove Pet Clinic',
  'Meadowbrook Animal Care','Pinecrest Veterinary Center','Equine Health Partners',
  'Western Equine Clinic','Bluegrass Horse Hospital','Rolling Hills Equine Center',
]
const CITIES = [
  ['Los Angeles','CA'],['New York','NY'],['Chicago','IL'],['Houston','TX'],['Phoenix','AZ'],
  ['Philadelphia','PA'],['San Antonio','TX'],['San Diego','CA'],['Dallas','TX'],['San Jose','CA'],
  ['Austin','TX'],['Jacksonville','FL'],['Fort Worth','TX'],['Columbus','OH'],['Charlotte','NC'],
  ['Seattle','WA'],['Denver','CO'],['Nashville','TN'],['Oklahoma City','OK'],['Portland','OR'],
  ['Toronto','ON'],['Vancouver','BC'],['Montreal','QC'],['Calgary','AB'],['Ottawa','ON'],
  ['London','ENG'],['Manchester','ENG'],['Edinburgh','SCO'],
]
const COLORS = ['Black','White','Brown','Golden','Gray','Cream','Tan','Brindle','Spotted','Tricolor','Orange','Calico','Tabby','Dapple','Roan']
const PAYMENT_METHODS = ['ach','check','wire','direct_deposit','zelle']

const DENIAL_REASONS = [
  'Pre-existing condition exclusion',
  'Waiting period not satisfied at time of service',
  'Cosmetic procedure - not covered',
  'Elective procedure - not covered',
  'Breed-specific exclusion',
  'Annual limit exhausted',
  'Sublimit exhausted for dental care',
  'No veterinary medical necessity documented',
  'Claim filed outside filing deadline',
  'Duplicate claim submission',
]
const DENIAL_CODES = [
  '{EXC-001}','{EXC-002}','{EXC-003}','{EXC-004}','{EXC-005}',
  '{LIM-001}','{LIM-002}','{MED-001}','{ADM-001}','{ADM-002}',
]

// ---------------------------------------------------------------------------
// TERRITORIES (8)
// ---------------------------------------------------------------------------

const TERRITORIES = [
  {
    id: uuid(), country: 'US', state_province: 'CA', rating_region: 'US-West-High',
    currency: 'USD',
    tax_rules: { premium_tax_pct: 2.35, stamp_duty: 0, surcharges: [] },
  },
  {
    id: uuid(), country: 'US', state_province: 'TX', rating_region: 'US-South-Mid',
    currency: 'USD',
    tax_rules: { premium_tax_pct: 1.60, stamp_duty: 0, surcharges: [] },
  },
  {
    id: uuid(), country: 'US', state_province: 'NY', rating_region: 'US-East-High',
    currency: 'USD',
    tax_rules: { premium_tax_pct: 2.00, stamp_duty: 0, surcharges: [{ name: 'fire_surcharge', pct: 0.10 }] },
  },
  {
    id: uuid(), country: 'US', state_province: 'FL', rating_region: 'US-South-Mid',
    currency: 'USD',
    tax_rules: { premium_tax_pct: 1.75, stamp_duty: 0, surcharges: [] },
  },
  {
    id: uuid(), country: 'US', state_province: 'WA', rating_region: 'US-West-Mid',
    currency: 'USD',
    tax_rules: { premium_tax_pct: 2.00, stamp_duty: 0, surcharges: [] },
  },
  {
    id: uuid(), country: 'CA', state_province: 'ON', rating_region: 'CA-Central',
    currency: 'CAD',
    tax_rules: { premium_tax_pct: 8.00, stamp_duty: 0, hst_pct: 13.0, surcharges: [] },
  },
  {
    id: uuid(), country: 'CA', state_province: 'BC', rating_region: 'CA-West',
    currency: 'CAD',
    tax_rules: { premium_tax_pct: 4.40, stamp_duty: 0, surcharges: [] },
  },
  {
    id: uuid(), country: 'GB', state_province: null, rating_region: 'GB-National',
    currency: 'GBP',
    tax_rules: { ipt_pct: 12.0, stamp_duty: 0, surcharges: [] },
  },
]

// ---------------------------------------------------------------------------
// PRODUCTS + COVERAGES (16 products)
// ---------------------------------------------------------------------------

function makeProduct(id, name, territoryId, underwriter, species, version, minAge, maxAge, rateBase, description) {
  return {
    id, territory_id: territoryId, name, underwriter, version,
    species_eligibility: species,
    min_pet_age_weeks: minAge, max_pet_age_years: maxAge,
    description, is_active: true,
    effective_date: '2022-01-01', expiry_date: null,
    rate_table: JSON.stringify({
      base_monthly_rate: rateBase,
      age_factors: { '0-2': 0.85, '2-5': 1.0, '5-8': 1.35, '8-10': 1.75, '10+': 2.20 },
      breed_factors: { high_risk: 1.40, medium_risk: 1.10, low_risk: 0.90 },
      deductible_factors: { '100': 1.25, '250': 1.0, '500': 0.80, '1000': 0.65 },
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// Build products per territory
function buildProducts(territories) {
  const us_ca = territories.find(t => t.country === 'US' && t.state_province === 'CA').id
  const us_tx = territories.find(t => t.country === 'US' && t.state_province === 'TX').id
  const us_ny = territories.find(t => t.country === 'US' && t.state_province === 'NY').id
  const us_fl = territories.find(t => t.country === 'US' && t.state_province === 'FL').id
  const us_wa = territories.find(t => t.country === 'US' && t.state_province === 'WA').id
  const ca_on = territories.find(t => t.country === 'CA' && t.state_province === 'ON').id
  const ca_bc = territories.find(t => t.country === 'CA' && t.state_province === 'BC').id
  const gb    = territories.find(t => t.country === 'GB').id

  return [
    // Dog products
    makeProduct(uuid(),'PawProtect Accident & Illness - Gold', us_ca,'Nationwide','["dog","cat"]','2.1',8,14,65,'Comprehensive A&I with wellness add-on. High limits.'),
    makeProduct(uuid(),'PawProtect Accident & Illness - Silver', us_tx,'Nationwide','["dog","cat"]','2.1',8,14,42,'Mid-tier A&I coverage for dogs and cats.'),
    makeProduct(uuid(),'TailWag Essential', us_ny,'Trupanion','["dog","cat"]','3.0',8,null,55,'Unlimited annual benefit. 90% reimbursement after deductible.'),
    makeProduct(uuid(),'TailWag Essential', us_fl,'Trupanion','["dog","cat"]','3.0',8,null,50,'Unlimited annual benefit. 90% reimbursement after deductible.'),
    makeProduct(uuid(),'TailWag Essential', us_wa,'Trupanion','["dog","cat"]','3.0',8,null,52,'Unlimited annual benefit. 90% reimbursement after deductible.'),
    makeProduct(uuid(),'CanineGuard Plus', us_ca,'Healthy Paws','["dog"]','1.5',8,10,75,'Dog-only premium coverage. Includes specialist referrals.'),
    makeProduct(uuid(),'FelineFirst Wellness', us_ca,'Pets Best','["cat"]','1.2',8,12,38,'Cat-focused plan with dental and preventive care.'),
    makeProduct(uuid(),'FelineFirst Wellness', us_ny,'Pets Best','["cat"]','1.2',8,12,40,'Cat-focused plan with dental and preventive care.'),
    // Horse products
    makeProduct(uuid(),'EquineShield Mortality & Major Medical', us_ca,'Markel','["horse"]','2.0',24,20,320,'Mortality, major medical, and surgical coverage for horses.'),
    makeProduct(uuid(),'EquineShield Mortality & Major Medical', us_tx,'Markel','["horse"]','2.0',24,20,290,'Mortality, major medical, and surgical coverage for horses.'),
    makeProduct(uuid(),'EquineShield Loss of Use', us_ca,'Markel','["horse"]','2.0',24,16,195,'Loss of use endorsement with major medical base.'),
    // Canada
    makeProduct(uuid(),'PetFirst Canada Comprehensive', ca_on,'Desjardins','["dog","cat"]','1.0',8,14,58,'Full A&I with wellness for Canadian policyholders - Ontario.'),
    makeProduct(uuid(),'PetFirst Canada Comprehensive', ca_bc,'Desjardins','["dog","cat"]','1.0',8,14,55,'Full A&I with wellness for Canadian policyholders - BC.'),
    // UK
    makeProduct(uuid(),'VetCare UK Lifetime', gb,'RSA','["dog","cat"]','4.1',8,null,72,'UK lifetime policy - condition limit resets annually.'),
    makeProduct(uuid(),'VetCare UK Accident Only', gb,'RSA','["dog","cat"]','4.1',8,null,28,'UK accident-only at lower premium.'),
    // Multi-species small animals
    makeProduct(uuid(),'SmallPaws Basic', us_ca,'Nationwide','["rabbit","bird","small_animal","reptile"]','1.0',4,8,18,'Exotic and small animal basic accident coverage.'),
  ]
}

// Coverages per product — returns flat array
function buildCoverages(products) {
  const rows = []

  const COVERAGE_TEMPLATES = {
    // Standard dog/cat A&I Gold
    'gold_dog_cat': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness', annual_limit: 15000, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['pre-existing conditions'], reimbursement_pcts: [70,80,90], deductible_options: [100,250,500], is_optional: false, sort_order: 0 },
      { coverage_type: 'wellness',         label: 'Routine Wellness',   annual_limit: 500,   sublimits: { vaccines: 150, flea_tick: 100, heartworm: 75, dental_cleaning: 150 }, waiting_period_days: 0, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [100], deductible_options: [0], is_optional: true, sort_order: 1 },
      { coverage_type: 'dental',           label: 'Dental Illness',     annual_limit: 1000,  sublimits: { per_tooth: 300 }, waiting_period_days: 180, accident_waiting_days: 0, exclusions: ['cosmetic','pre-existing dental disease'], reimbursement_pcts: [70,80], deductible_options: [250,500], is_optional: true, sort_order: 2 },
      { coverage_type: 'prescription',     label: 'Prescription Drugs', annual_limit: 2000,  sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['compounded medications not FDA approved'], reimbursement_pcts: [70,80,90], deductible_options: [100,250], is_optional: true, sort_order: 3 },
      { coverage_type: 'behavioral',       label: 'Behavioral Therapy', annual_limit: 500,   sublimits: {}, waiting_period_days: 30, accident_waiting_days: 0, exclusions: ['training classes'], reimbursement_pcts: [50,80], deductible_options: [250], is_optional: true, sort_order: 4 },
    ],
    'silver_dog_cat': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness', annual_limit: 8000, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['pre-existing conditions'], reimbursement_pcts: [70,80], deductible_options: [250,500,1000], is_optional: false, sort_order: 0 },
      { coverage_type: 'wellness',         label: 'Routine Wellness',   annual_limit: 250,  sublimits: { vaccines: 100 }, waiting_period_days: 0, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [100], deductible_options: [0], is_optional: true, sort_order: 1 },
      { coverage_type: 'prescription',     label: 'Prescription Drugs', annual_limit: 1000, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [70,80], deductible_options: [250,500], is_optional: true, sort_order: 2 },
    ],
    'trupanion_style': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness - Unlimited', annual_limit: null, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 5, exclusions: ['pre-existing conditions','preventive care'], reimbursement_pcts: [90], deductible_options: [0,200,500,1000,1500], is_optional: false, sort_order: 0 },
      { coverage_type: 'prescription',     label: 'Prescription Food',              annual_limit: 1000, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 5, exclusions: [], reimbursement_pcts: [90], deductible_options: [0], is_optional: true, sort_order: 1 },
    ],
    'canine_plus': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness', annual_limit: 20000, sublimits: { specialist: 5000, emergency: 8000, physical_therapy: 1500 }, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['pre-existing conditions','elective procedures'], reimbursement_pcts: [80,90], deductible_options: [100,250,500], is_optional: false, sort_order: 0 },
      { coverage_type: 'alternative_therapy', label: 'Alternative Therapy', annual_limit: 1000, sublimits: { acupuncture: 500, hydrotherapy: 500 }, waiting_period_days: 30, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [50,80], deductible_options: [250], is_optional: true, sort_order: 1 },
      { coverage_type: 'behavioral',       label: 'Behavioral Therapy', annual_limit: 750, sublimits: {}, waiting_period_days: 30, accident_waiting_days: 0, exclusions: ['training'], reimbursement_pcts: [50,80], deductible_options: [250], is_optional: true, sort_order: 2 },
    ],
    'feline_wellness': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness', annual_limit: 10000, sublimits: { dental: 800 }, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['pre-existing conditions'], reimbursement_pcts: [70,80], deductible_options: [250,500], is_optional: false, sort_order: 0 },
      { coverage_type: 'wellness',         label: 'Preventive Care',   annual_limit: 400,  sublimits: { vaccines: 120, spay_neuter: 200 }, waiting_period_days: 0, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [100], deductible_options: [0], is_optional: true, sort_order: 1 },
      { coverage_type: 'dental',           label: 'Dental Disease',    annual_limit: 1200, sublimits: {}, waiting_period_days: 180, accident_waiting_days: 0, exclusions: ['cosmetic'], reimbursement_pcts: [70,80], deductible_options: [250], is_optional: true, sort_order: 2 },
    ],
    'equine_mm': [
      { coverage_type: 'mortality',        label: 'Mortality',         annual_limit: 100000, sublimits: {}, waiting_period_days: 30, accident_waiting_days: 3, exclusions: ['pre-existing conditions','war','intentional acts'], reimbursement_pcts: [100], deductible_options: [0], is_optional: false, sort_order: 0 },
      { coverage_type: 'accident_illness', label: 'Major Medical',     annual_limit: 15000,  sublimits: { surgical: 10000, diagnostic: 3000 }, waiting_period_days: 30, accident_waiting_days: 3, exclusions: ['pre-existing conditions','routine farriery'], reimbursement_pcts: [80,90], deductible_options: [250,500,1000,2500], is_optional: false, sort_order: 1 },
      { coverage_type: 'surgical_only',    label: 'Colic Surgery',     annual_limit: 10000,  sublimits: {}, waiting_period_days: 30, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [80,90], deductible_options: [500,1000], is_optional: true, sort_order: 2 },
    ],
    'equine_lou': [
      { coverage_type: 'mortality',        label: 'Mortality',         annual_limit: 75000, sublimits: {}, waiting_period_days: 30, accident_waiting_days: 3, exclusions: ['pre-existing'], reimbursement_pcts: [100], deductible_options: [0], is_optional: false, sort_order: 0 },
      { coverage_type: 'loss_of_use',      label: 'Loss of Use',       annual_limit: 50000, sublimits: {}, waiting_period_days: 30, accident_waiting_days: 3, exclusions: ['poor performance','lameness under 50%'], reimbursement_pcts: [60], deductible_options: [0], is_optional: false, sort_order: 1 },
      { coverage_type: 'accident_illness', label: 'Major Medical',     annual_limit: 10000, sublimits: {}, waiting_period_days: 30, accident_waiting_days: 3, exclusions: ['pre-existing'], reimbursement_pcts: [80], deductible_options: [500,1000], is_optional: true, sort_order: 2 },
    ],
    'canada_comp': [
      { coverage_type: 'accident_illness', label: 'Accident & Illness', annual_limit: 10000, sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: ['pre-existing conditions'], reimbursement_pcts: [70,80,90], deductible_options: [200,500], is_optional: false, sort_order: 0 },
      { coverage_type: 'wellness',         label: 'Wellness',           annual_limit: 300,   sublimits: {}, waiting_period_days: 0, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [100], deductible_options: [0], is_optional: true, sort_order: 1 },
      { coverage_type: 'prescription',     label: 'Prescription Drugs', annual_limit: 1500,  sublimits: {}, waiting_period_days: 14, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [70,80], deductible_options: [200,500], is_optional: true, sort_order: 2 },
    ],
    'uk_lifetime': [
      { coverage_type: 'accident_illness', label: 'Lifetime A&I',      annual_limit: 12000, sublimits: { per_condition: 6000 }, waiting_period_days: 14, accident_waiting_days: 2, exclusions: ['pre-existing conditions','elective procedures'], reimbursement_pcts: [80], deductible_options: [99,149,199], is_optional: false, sort_order: 0 },
      { coverage_type: 'dental',           label: 'Dental Illness',    annual_limit: 1000,  sublimits: {}, waiting_period_days: 90, accident_waiting_days: 0, exclusions: ['scale and polish','cosmetic'], reimbursement_pcts: [80], deductible_options: [99], is_optional: true, sort_order: 1 },
      { coverage_type: 'boarding',         label: 'Emergency Boarding', annual_limit: 1500, sublimits: {}, waiting_period_days: 0, accident_waiting_days: 0, exclusions: [], reimbursement_pcts: [80], deductible_options: [0], is_optional: true, sort_order: 2 },
    ],
    'uk_accident': [
      { coverage_type: 'accident_only',    label: 'Accident Only',     annual_limit: 5000, sublimits: {}, waiting_period_days: 0, accident_waiting_days: 2, exclusions: ['illness','pre-existing conditions'], reimbursement_pcts: [80], deductible_options: [99,149], is_optional: false, sort_order: 0 },
    ],
    'small_paws': [
      { coverage_type: 'accident_only',    label: 'Accident Only',     annual_limit: 2000, sublimits: {}, waiting_period_days: 0, accident_waiting_days: 0, exclusions: ['illness','wellness'], reimbursement_pcts: [80], deductible_options: [100,250], is_optional: false, sort_order: 0 },
    ],
  }

  // Map product names → templates
  const TEMPLATE_MAP = [
    ['PawProtect Accident & Illness - Gold',          'gold_dog_cat'],
    ['PawProtect Accident & Illness - Silver',        'silver_dog_cat'],
    ['TailWag Essential',                             'trupanion_style'],
    ['CanineGuard Plus',                              'canine_plus'],
    ['FelineFirst Wellness',                          'feline_wellness'],
    ['EquineShield Mortality & Major Medical',        'equine_mm'],
    ['EquineShield Loss of Use',                      'equine_lou'],
    ['PetFirst Canada Comprehensive',                 'canada_comp'],
    ['VetCare UK Lifetime',                           'uk_lifetime'],
    ['VetCare UK Accident Only',                      'uk_accident'],
    ['SmallPaws Basic',                               'small_paws'],
  ]

  for (const product of products) {
    const entry = TEMPLATE_MAP.find(([n]) => product.name.startsWith(n))
    const templateKey = entry ? entry[1] : 'silver_dog_cat'
    const templates = COVERAGE_TEMPLATES[templateKey]
    for (const t of templates) {
      rows.push({
        id: uuid(),
        product_id: product.id,
        coverage_type: t.coverage_type,
        label: t.label,
        annual_limit: t.annual_limit ?? null,
        sublimits: JSON.stringify(t.sublimits),
        waiting_period_days: t.waiting_period_days,
        accident_waiting_days: t.accident_waiting_days,
        exclusions: `{${t.exclusions.map(e => `"${e.replace(/"/g, '\\"')}"`).join(',')}}`,
        reimbursement_pcts: `{${t.reimbursement_pcts.join(',')}}`,
        deductible_options: `{${t.deductible_options.join(',')}}`,
        is_optional: t.is_optional,
        sort_order: t.sort_order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// MAIN SEED
// ---------------------------------------------------------------------------

async function seed() {
  const client = await pool.connect()
  try {
    console.log('🌱 Starting seed...\n')

    // -----------------------------------------------------------------------
    // 0. Clear existing seed data (idempotent)
    // -----------------------------------------------------------------------
    console.log('🧹 Clearing existing analytics seed data...')
    // Use separate statements — pg driver doesn't support multi-statement in query()
    const cleanups = [
      `DELETE FROM public.claim_payments WHERE notes LIKE 'seed:%'`,
      `DELETE FROM public.claim_events   WHERE actor = 'seed'`,
      `DELETE FROM public.endorsements   WHERE notes LIKE 'seed:%'`,
      `DELETE FROM public.policies       WHERE policy_number LIKE 'SEED-%'`,
      `DELETE FROM public.policy_quotes  WHERE zip_code LIKE 'SEED%'`,
      `DELETE FROM public.claims         WHERE visit_notes LIKE 'seed:%'`,
      `DELETE FROM public.pets           WHERE color LIKE 'seed:%'`,
      `DELETE FROM public.profiles       WHERE email LIKE '%@seed.petins.dev'`,
      `DELETE FROM public.coverages      WHERE product_id IN (SELECT id FROM public.products WHERE underwriter IN ('Nationwide','Trupanion','Healthy Paws','Pets Best','Markel','Desjardins','RSA'))`,
      `DELETE FROM public.products       WHERE underwriter IN ('Nationwide','Trupanion','Healthy Paws','Pets Best','Markel','Desjardins','RSA')`,
      `DELETE FROM public.territories    WHERE country IN ('US','CA','GB') AND rating_region IN ('US-West-High','US-South-Mid','US-East-High','US-West-Mid','CA-Central','CA-West','GB-National')`,
      `DELETE FROM auth.users            WHERE email LIKE '%@seed.petins.dev'`,
    ]
    for (const sql of cleanups) await client.query(sql)
    console.log('  Done.\n')

    // -----------------------------------------------------------------------
    // 1. Territories
    // -----------------------------------------------------------------------
    console.log('📍 Inserting territories...')
    // Upsert territories so re-runs are safe even if cleanup missed some
    for (const t of TERRITORIES) {
      await client.query(
        `INSERT INTO public.territories (id,country,state_province,rating_region,currency,tax_rules,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (country,state_province) DO UPDATE
           SET id=EXCLUDED.id, rating_region=EXCLUDED.rating_region,
               currency=EXCLUDED.currency, tax_rules=EXCLUDED.tax_rules`,
        [t.id, t.country, t.state_province, t.rating_region, t.currency, JSON.stringify(t.tax_rules), true]
      )
      // Update the in-memory id to whatever is now in the DB (handles conflict case)
      const res = await client.query(`SELECT id FROM public.territories WHERE country=$1 AND state_province IS NOT DISTINCT FROM $2`, [t.country, t.state_province])
      t.id = res.rows[0].id
    }
    console.log(`  ✓ ${TERRITORIES.length} territories\n`)

    // -----------------------------------------------------------------------
    // 2. Products
    // -----------------------------------------------------------------------
    console.log('📦 Inserting products...')
    const products = buildProducts(TERRITORIES)
    await batchInsert(client, 'products',
      ['id','territory_id','name','species_eligibility','underwriter','version',
       'description','min_pet_age_weeks','max_pet_age_years','is_active',
       'effective_date','expiry_date','rate_table','created_at','updated_at'],
      products.map(p => ({
        ...p,
        // Convert JSON array string to Postgres array literal: {dog,cat}
        species_eligibility: `{${JSON.parse(p.species_eligibility).join(',')}}`,
        expiry_date: p.expiry_date || null,
      }))
    )
    console.log(`  ✓ ${products.length} products\n`)

    // -----------------------------------------------------------------------
    // 3. Coverages
    // -----------------------------------------------------------------------
    console.log('🛡️  Inserting coverages...')
    const coverages = buildCoverages(products)
    await batchInsert(client, 'coverages',
      ['id','product_id','coverage_type','label','annual_limit','sublimits',
       'waiting_period_days','accident_waiting_days','exclusions',
       'reimbursement_pcts','deductible_options','is_optional','sort_order',
       'created_at','updated_at'],
      coverages
    )
    console.log(`  ✓ ${coverages.length} coverages\n`)

    // -----------------------------------------------------------------------
    // 4. Profiles (50k) — stub auth.users rows first to satisfy FK
    // -----------------------------------------------------------------------
    console.log('👤 Generating 50,000 profiles...')
    const PROFILE_COUNT = 50_000
    const profileRows = []
    const profileIds = []

    // Pre-generate all UUIDs so auth.users and profiles share the same ids
    for (let i = 0; i < PROFILE_COUNT; i++) profileIds.push(uuid())

    // Insert stub auth.users rows (satisfies profiles FK)
    console.log('  Inserting auth.users stubs...')
    const now = new Date().toISOString()
    for (let i = 0; i < PROFILE_COUNT; i += 1000) {
      const batch = profileIds.slice(i, i + 1000)
      const placeholders = batch.map((_, ri) => `($${ri * 3 + 1},$${ri * 3 + 2},$${ri * 3 + 3})`).join(',')
      const values = batch.flatMap((id, ri) => [id, `user${i + ri + 1}@seed.petins.dev`, now])
      await client.query(
        `INSERT INTO auth.users (id, email, created_at) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`,
        values
      )
      progress('  auth.users', i + batch.length, PROFILE_COUNT)
    }
    console.log()

    // Territory distribution for profiles
    const terrWeights = [
      { value: 0, weight: 25 }, // US-CA
      { value: 1, weight: 18 }, // US-TX
      { value: 2, weight: 15 }, // US-NY
      { value: 3, weight: 12 }, // US-FL
      { value: 4, weight: 8  }, // US-WA
      { value: 5, weight: 10 }, // CA-ON
      { value: 6, weight: 7  }, // CA-BC
      { value: 7, weight: 5  }, // GB
    ]
    const terrCities = [
      [['Los Angeles','CA'],['San Diego','CA'],['San Francisco','CA'],['Sacramento','CA']],
      [['Houston','TX'],['Dallas','TX'],['Austin','TX'],['San Antonio','TX']],
      [['New York','NY'],['Buffalo','NY'],['Albany','NY']],
      [['Miami','FL'],['Orlando','FL'],['Tampa','FL'],['Jacksonville','FL']],
      [['Seattle','WA'],['Portland','OR'],['Spokane','WA']],
      [['Toronto','ON'],['Ottawa','ON'],['Hamilton','ON']],
      [['Vancouver','BC'],['Victoria','BC'],['Kelowna','BC']],
      [['London','ENG'],['Manchester','ENG'],['Edinburgh','SCO'],['Birmingham','ENG']],
    ]

    for (let i = 0; i < PROFILE_COUNT; i++) {
      const id = profileIds[i]
      const terrIdx = weighted(terrWeights)
      const [city, stProv] = pick(terrCities[terrIdx])
      const firstName = pick(FIRST_NAMES)
      const lastName = pick(LAST_NAMES)
      const insCompanies = ['Nationwide','Trupanion','Healthy Paws','Pets Best','Figo','Spot','ASPCA','Embrace','Lemonade']
      profileRows.push({
        id,
        email: `user${i + 1}@seed.petins.dev`,
        full_name: `${firstName} ${lastName}`,
        phone: `+1${randInt(2000000000, 9999999999)}`,
        address: `${randInt(100, 9999)} ${pick(LAST_NAMES)} St, ${city}, ${stProv}`,
        email_notifications: rand() > 0.15,
        email_reminders: rand() > 0.5,
        weekly_summaries: rand() > 0.6,
        deadline_alerts: rand() > 0.4,
        default_expense_category: pick(['insured','uninsured','wellness']),
        default_time_period: 'all_time',
        insurance_company: rand() > 0.1 ? pick(insCompanies) : null,
        filing_deadline_days: pick([60,90,180,365]),
        sms_opt_in: rand() > 0.3,
        created_at: new Date(Date.now() - randInt(0, 3 * 365 * 86400 * 1000)).toISOString(),
      })

      if (profileRows.length % 10000 === 0) progress('profiles', profileRows.length, PROFILE_COUNT)
    }
    progress('profiles', PROFILE_COUNT, PROFILE_COUNT)

    for (let i = 0; i < profileRows.length; i += 1000) {
      const batch = profileRows.slice(i, i + 1000)
      await batchInsert(client, 'profiles',
        ['id','email','full_name','phone','address','email_notifications','email_reminders',
         'weekly_summaries','deadline_alerts','default_expense_category','default_time_period',
         'insurance_company','filing_deadline_days','sms_opt_in','created_at'],
        batch
      )
      progress('  profiles inserted', i + batch.length, PROFILE_COUNT)
    }
    console.log(`\n  ✓ ${PROFILE_COUNT.toLocaleString()} profiles\n`)

    // -----------------------------------------------------------------------
    // 5. Pets (80k)
    // -----------------------------------------------------------------------
    console.log('🐾 Generating 80,000 pets...')
    const PET_COUNT = 80_000
    const petRows = []
    const petIds = []
    const petSpecies = []

    // Species distribution
    const speciesWeights = [
      { value: 'dog',  weight: 52 },
      { value: 'cat',  weight: 35 },
      { value: 'horse',weight: 6  },
      { value: 'rabbit', weight: 3 },
      { value: 'bird', weight: 2  },
      { value: 'small_animal', weight: 1.5 },
      { value: 'reptile', weight: 0.5 },
    ]
    const insCompanyBySpecies = {
      dog:   ['Nationwide','Trupanion','Healthy Paws','Pets Best','Spot','Figo','Embrace'],
      cat:   ['Nationwide','Trupanion','Pets Best','Figo','ASPCA','Lemonade'],
      horse: ['Markel','Lloyds','Great American','American Equine'],
      rabbit: ['Nationwide','Exotic Direct'],
      bird:   ['Nationwide','Exotic Direct'],
      small_animal: ['Nationwide'],
      reptile: ['Nationwide','Exotic Direct'],
    }

    for (let i = 0; i < PET_COUNT; i++) {
      const id = uuid()
      petIds.push(id)
      const userId = pick(profileIds)
      const species = weighted(speciesWeights)
      petSpecies.push(species)

      let breed, name, ageYears
      if (species === 'dog') {
        breed = pick(DOG_BREEDS)
        name = pick(['Max','Bella','Charlie','Luna','Cooper','Lucy','Buddy','Daisy','Rocky','Molly',
                     'Jack','Sadie','Bear','Lola','Oliver','Maggie','Duke','Zoe','Tucker','Abby',
                     'Zeus','Stella','Finn','Rosie','Milo','Gracie','Jax','Chloe','Leo','Nala'])
        ageYears = weighted([{value:0.5,weight:5},{value:1,weight:10},{value:2,weight:15},{value:3,weight:12},{value:4,weight:10},{value:5,weight:10},{value:6,weight:10},{value:7,weight:8},{value:8,weight:8},{value:10,weight:7},{value:12,weight:5}])
      } else if (species === 'cat') {
        breed = pick(CAT_BREEDS)
        name = pick(['Whiskers','Luna','Oliver','Bella','Charlie','Lucy','Max','Cleo','Simba','Nala',
                     'Mittens','Shadow','Misty','Oreo','Jasper','Chloe','Tiger','Lily','Smokey','Mia'])
        ageYears = weighted([{value:0.5,weight:5},{value:1,weight:8},{value:2,weight:12},{value:3,weight:12},{value:4,weight:10},{value:5,weight:10},{value:6,weight:10},{value:7,weight:8},{value:8,weight:8},{value:10,weight:8},{value:12,weight:9}])
      } else if (species === 'horse') {
        breed = pick(HORSE_BREEDS)
        name = pick(['Thunder','Spirit','Shadow','Blaze','Bella','Duke','Lucky','Star','Ranger','Scout',
                     'Gunner','Ace','Chase','Zeus','Apollo','Titan','Diesel','Dakota','Buck','Rebel'])
        ageYears = weighted([{value:2,weight:8},{value:4,weight:15},{value:6,weight:20},{value:8,weight:18},{value:10,weight:15},{value:12,weight:12},{value:15,weight:8},{value:18,weight:4}])
      } else {
        breed = null
        name = pick(['Nibbles','Peanut','Coco','Hazel','Benny','Snowy','Ginger','Pepper','Clover','Bean'])
        ageYears = randInt(1, 6)
      }

      const insComp = rand() > 0.08 ? pick(insCompanyBySpecies[species] || ['Nationwide']) : null
      const filingDays = pick([60,90,180,365])

      petRows.push({
        id,
        user_id: userId,
        name,
        species,
        color: `seed:${pick(COLORS)}`,
        photo_url: null,
        insurance_company: insComp,
        policy_number: insComp ? `${insComp.substring(0,3).toUpperCase()}-${randInt(100000,999999)}` : null,
        owner_name: null,
        owner_address: null,
        owner_phone: null,
        filing_deadline_days: filingDays,
        created_at: new Date(Date.now() - randInt(0, 3 * 365 * 86400 * 1000)).toISOString(),
      })

      if ((i + 1) % 10000 === 0) progress('generating pets', i + 1, PET_COUNT)
    }
    progress('generating pets', PET_COUNT, PET_COUNT)

    for (let i = 0; i < petRows.length; i += 1000) {
      const batch = petRows.slice(i, i + 1000)
      await batchInsert(client, 'pets',
        ['id','user_id','name','species','color','photo_url','insurance_company',
         'policy_number','owner_name','owner_address','owner_phone','filing_deadline_days','created_at'],
        batch
      )
      progress('  pets inserted', i + batch.length, PET_COUNT)
    }
    console.log(`\n  ✓ ${PET_COUNT.toLocaleString()} pets\n`)

    // -----------------------------------------------------------------------
    // 6. Policies (one per pet that has insurance — ~75% of pets)
    // -----------------------------------------------------------------------
    console.log('📋 Generating policies...')
    const policyRows = []
    const policyIds = []
    const policyByPet = {}   // petId -> policyId
    const policyData = {}    // policyId -> {deductible, co_insurance, annual_limit, currency, territory_id, product_id}

    const productsBySpecies = {}
    for (const p of products) {
      const specs = JSON.parse(p.species_eligibility)
      for (const s of specs) {
        if (!productsBySpecies[s]) productsBySpecies[s] = []
        productsBySpecies[s].push(p)
      }
    }

    for (let i = 0; i < petIds.length; i++) {
      if (rand() > 0.75) continue  // ~25% uninsured

      const petId = petIds[i]
      const species = petSpecies[i]
      const userId = petRows[i].user_id

      const eligibleProducts = productsBySpecies[species] || productsBySpecies['dog']
      const product = pick(eligibleProducts)
      const territory = TERRITORIES.find(t => t.id === product.territory_id)
      const currency = territory.currency

      const deductibleOptions = species === 'horse' ? [250, 500, 1000, 2500] : [100, 250, 500, 1000]
      const deductible = pick(deductibleOptions)
      const coInsurance = pick([70, 80, 90])
      const annualLimit = species === 'horse'
        ? pick([15000, 25000, 50000, 100000, null])
        : pick([5000, 8000, 10000, 15000, 20000, null])

      const effectiveDate = randDate('2022-01-01', '2025-06-01')
      const expiryDate = addMonths(effectiveDate, 12)
      const isExpired = new Date(expiryDate) < new Date()
      const status = isExpired
        ? weighted([{value:'expired',weight:60},{value:'cancelled',weight:10},{value:'lapsed',weight:30}])
        : weighted([{value:'active',weight:85},{value:'lapsed',weight:8},{value:'cancelled',weight:7}])

      const basePremium = parseFloat(product.rate_table ? JSON.parse(product.rate_table).base_monthly_rate : 50)
      const annualPremium = parseFloat((basePremium * 12 * (0.85 + rand() * 0.5)).toFixed(2))

      const policyId = uuid()
      policyIds.push(policyId)
      policyByPet[petId] = policyId
      policyData[policyId] = { deductible, co_insurance: coInsurance, annual_limit: annualLimit, currency, territory_id: territory.id, product_id: product.id, userId }

      policyRows.push({
        id: policyId,
        quote_id: null,
        user_id: userId,
        pet_id: petId,
        product_id: product.id,
        territory_id: territory.id,
        policy_number: `SEED-${territory.country}-${policyId.replace(/-/g,'').slice(0,12).toUpperCase()}`,
        status,
        effective_date: effectiveDate,
        expiry_date: expiryDate,
        issue_date: effectiveDate,
        cancel_date: ['cancelled','lapsed'].includes(status) ? addDays(effectiveDate, randInt(30, 200)) : null,
        cancel_reason: status === 'cancelled' ? pick(['Non-payment','Moved out of territory','Request cancellation','Underwriting']) : null,
        annual_premium: annualPremium,
        deductible,
        co_insurance: coInsurance,
        annual_limit: annualLimit,
        billing_frequency: pick(['monthly','monthly','monthly','annual','quarterly']),
        deductible_met: 0,
        limit_used: 0,
        coverage_snapshot: JSON.stringify({ product: product.name, underwriter: product.underwriter }),
        created_at: new Date(effectiveDate).toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    for (let i = 0; i < policyRows.length; i += 1000) {
      const batch = policyRows.slice(i, i + 1000)
      await batchInsert(client, 'policies',
        ['id','quote_id','user_id','pet_id','product_id','territory_id','policy_number',
         'status','effective_date','expiry_date','issue_date','cancel_date','cancel_reason',
         'annual_premium','deductible','co_insurance','annual_limit','billing_frequency',
         'deductible_met','limit_used','coverage_snapshot','created_at','updated_at'],
        batch
      )
      progress('  policies inserted', i + batch.length, policyRows.length)
    }
    console.log(`\n  ✓ ${policyRows.length.toLocaleString()} policies\n`)

    // -----------------------------------------------------------------------
    // 7. Claims (100k) + claim_events + claim_payments
    // -----------------------------------------------------------------------
    console.log('🏥 Generating 100,000 claims...')
    const CLAIM_COUNT = 100_000
    const claimRows = []
    const claimEventRows = []
    const claimPaymentRows = []

    // Claim outcome distribution (realistic)
    // 60% approved, 10% partially approved, 20% denied, 10% pending/in-flight
    const outcomeWeights = [
      { value: 'approved',           weight: 58 },
      { value: 'partially_approved', weight: 10 },
      { value: 'denied',             weight: 20 },
      { value: 'in_flight',          weight: 12 },
    ]

    // Cost distribution: small frequent, occasional large, rare catastrophic
    const costWeights = {
      dog:   [{value:[50,300],weight:45},{value:[300,1500],weight:35},{value:[1500,8000],weight:16},{value:[8000,25000],weight:4}],
      cat:   [{value:[50,250],weight:50},{value:[250,1200],weight:35},{value:[1200,6000],weight:13},{value:[6000,15000],weight:2}],
      horse: [{value:[500,3000],weight:35},{value:[3000,10000],weight:35},{value:[10000,30000],weight:22},{value:[30000,100000],weight:8}],
      other: [{value:[50,400],weight:60},{value:[400,1500],weight:32},{value:[1500,5000],weight:8}],
    }

    const filingStatuses = {
      approved:           'approved',
      partially_approved: 'approved',
      denied:             'approved',
      in_flight:          weighted([{value:'not_filed',weight:30},{value:'filed',weight:50},{value:'in_review',weight:20}]),
    }

    // Insured petIds with policies
    const insuredPetIds = petIds.filter(id => policyByPet[id])

    for (let i = 0; i < CLAIM_COUNT; i++) {
      const claimId = uuid()

      // Pick a pet — slightly weighted towards insured pets
      const petId = rand() > 0.15 ? pick(insuredPetIds) : pick(petIds)
      const petIdx = petIds.indexOf(petId)
      const species = petSpecies[petIdx] || 'dog'
      const userId = petRows[petIdx]?.user_id || pick(profileIds)

      const policyId = policyByPet[petId] || null
      const pd = policyId ? policyData[policyId] : null
      const currency = pd?.currency || 'USD'

      const serviceDate = randDate('2022-03-01', '2026-01-01')
      const deadlineDate = addDays(serviceDate, pick([60, 90, 180, 365]))

      const diagList = DIAGNOSES[species] || DIAGNOSES.dog
      const diagnosis = pick(diagList)
      const clinicName = pick(CLINIC_NAMES)
      const [clinicCity, clinicState] = pick(CITIES)

      // Cost
      const costRange = weighted(costWeights[species] || costWeights.other)
      const totalAmount = parseFloat((costRange[0] + rand() * (costRange[1] - costRange[0])).toFixed(2))

      // Outcome
      const outcome = policyId ? weighted(outcomeWeights) : 'in_flight'

      // Filing status
      let filingStatus
      if (outcome === 'approved' || outcome === 'partially_approved') filingStatus = 'approved'
      else if (outcome === 'denied') filingStatus = 'approved'
      else filingStatus = weighted([{value:'not_filed',weight:30},{value:'filed',weight:40},{value:'in_review',weight:30}])

      const filedDate = filingStatus !== 'not_filed' ? addDays(serviceDate, randInt(1, 30)) : null
      const approvedDate = (outcome === 'approved' || outcome === 'partially_approved') ? addDays(filedDate || serviceDate, randInt(5, 45)) : null
      const paidDate = approvedDate ? addDays(approvedDate, randInt(3, 21)) : null

      // Reimbursed amount
      let reimbursedAmount = null
      if (outcome === 'approved' && pd) {
        const eligible = Math.max(0, totalAmount - (pd.deductible || 250))
        const limited = pd.annual_limit ? Math.min(eligible, pd.annual_limit) : eligible
        reimbursedAmount = parseFloat((limited * ((pd.co_insurance || 80) / 100)).toFixed(2))
      } else if (outcome === 'partially_approved' && pd) {
        // Sublimit applied — reimburse only a portion
        const sublimitFactor = pick([0.2, 0.3, 0.4, 0.5, 0.6])
        const eligible = Math.max(0, totalAmount * sublimitFactor - (pd.deductible || 250) * sublimitFactor)
        reimbursedAmount = parseFloat((eligible * ((pd.co_insurance || 80) / 100)).toFixed(2))
      }

      claimRows.push({
        id: claimId,
        user_id: userId,
        pet_id: petId,
        service_date: serviceDate,
        deadline_date: deadlineDate,
        visit_title: `${diagnosis.split('-')[0].trim()} - ${pick(['Exam & Treatment','Surgery','Diagnostics','Follow-up','Emergency Visit'])}`,
        invoice_number: `INV-${randInt(10000, 999999)}`,
        clinic_name: clinicName,
        clinic_address: `${randInt(100, 9999)} Vet Blvd, ${clinicCity}, ${clinicState}`,
        diagnosis,
        total_amount: totalAmount,
        line_items: JSON.stringify([
          { description: 'Exam fee', amount: parseFloat((totalAmount * 0.15).toFixed(2)) },
          { description: diagnosis, amount: parseFloat((totalAmount * 0.65).toFixed(2)) },
          { description: 'Medications', amount: parseFloat((totalAmount * 0.20).toFixed(2)) },
        ]),
        filing_status: filingStatus,
        filing_deadline_days: pick([60,90,180]),
        filed_date: filedDate,
        approved_date: approvedDate,
        reimbursed_amount: reimbursedAmount,
        paid_date: paidDate,
        visit_notes: `seed:outcome=${outcome}|currency=${currency}`,
        created_at: new Date(serviceDate).toISOString(),
        pdf_path: null,
        sent_reminders: JSON.stringify({}),
        expense_category: pick(['insured','insured','insured','wellness','uninsured']),
        medication_ids: JSON.stringify([]),
      })

      // --- Claim Events (lifecycle) ---
      const baseTime = new Date(serviceDate).getTime()
      let eventTime = baseTime

      // FNOL always
      claimEventRows.push({
        id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
        event_type: 'fnol', occurred_at: new Date(eventTime).toISOString(),
        submitted_amount: totalAmount,
        eligible_amount: null, deductible_applied: null, coinsurance_applied: null, approved_amount: null,
        denial_reason: null, denial_codes: '{}', document_urls: '{}',
        notes: `FNOL submitted for ${diagnosis}`, actor: 'seed',
        metadata: JSON.stringify({ currency }),
        created_at: new Date(eventTime).toISOString(),
      })

      if (filingStatus !== 'not_filed') {
        // Acknowledged
        eventTime += randInt(1, 3) * 86400000
        claimEventRows.push({
          id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
          event_type: 'acknowledged', occurred_at: new Date(eventTime).toISOString(),
          submitted_amount: totalAmount,
          eligible_amount: null, deductible_applied: null, coinsurance_applied: null, approved_amount: null,
          denial_reason: null, denial_codes: '{}', document_urls: '{}',
          notes: 'Claim acknowledged by insurer', actor: 'seed',
          metadata: JSON.stringify({}),
          created_at: new Date(eventTime).toISOString(),
        })

        // Docs requested (40% of the time)
        if (rand() > 0.6) {
          eventTime += randInt(1, 5) * 86400000
          claimEventRows.push({
            id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'docs_requested', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: null, deductible_applied: null, coinsurance_applied: null, approved_amount: null,
            denial_reason: null, denial_codes: '{}', document_urls: '{}',
            notes: 'Additional records requested: ' + pick(['SOAP notes','Invoice itemization','Vaccination records','Prior vet history']),
            actor: 'seed', metadata: JSON.stringify({}),
            created_at: new Date(eventTime).toISOString(),
          })
          eventTime += randInt(3, 14) * 86400000
          claimEventRows.push({
            id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'docs_received', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: null, deductible_applied: null, coinsurance_applied: null, approved_amount: null,
            denial_reason: null, denial_codes: '{}', document_urls: '{}',
            notes: 'Documents received', actor: 'seed', metadata: JSON.stringify({}),
            created_at: new Date(eventTime).toISOString(),
          })
        }

        // Under review
        eventTime += randInt(2, 10) * 86400000
        claimEventRows.push({
          id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
          event_type: 'under_review', occurred_at: new Date(eventTime).toISOString(),
          submitted_amount: totalAmount,
          eligible_amount: null, deductible_applied: null, coinsurance_applied: null, approved_amount: null,
          denial_reason: null, denial_codes: '{}', document_urls: '{}',
          notes: 'Claim under adjudication', actor: 'seed', metadata: JSON.stringify({}),
          created_at: new Date(eventTime).toISOString(),
        })

        // Final adjudication event
        if (outcome === 'approved' || outcome === 'partially_approved') {
          const eligibleAmount = pd ? parseFloat(Math.max(0, totalAmount - (pd.deductible || 250)).toFixed(2)) : totalAmount * 0.8
          const dedApplied = pd ? parseFloat(Math.min(totalAmount, pd.deductible || 250).toFixed(2)) : 0
          const coinsuranceApplied = parseFloat((eligibleAmount * (1 - (pd?.co_insurance || 80) / 100)).toFixed(2))
          const approvedAmount = reimbursedAmount || 0

          eventTime += randInt(5, 30) * 86400000
          const adjEventId = uuid()
          claimEventRows.push({
            id: adjEventId, claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: outcome,
            occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: eligibleAmount,
            deductible_applied: dedApplied,
            coinsurance_applied: coinsuranceApplied,
            approved_amount: approvedAmount,
            denial_reason: outcome === 'partially_approved'
              ? pick(['Sublimit applied: dental','Sublimit applied: alternative therapy','Deductible partially met','Annual limit reached'])
              : null,
            denial_codes: '{}', document_urls: '{}',
            notes: outcome === 'partially_approved' ? 'Partially approved due to sublimit' : 'Claim approved',
            actor: 'seed', metadata: JSON.stringify({ currency }),
            created_at: new Date(eventTime).toISOString(),
          })

          // Payment issued event
          eventTime += randInt(3, 14) * 86400000
          const payEventId = uuid()
          claimEventRows.push({
            id: payEventId, claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'payment_issued', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: eligibleAmount, deductible_applied: dedApplied,
            coinsurance_applied: coinsuranceApplied, approved_amount: approvedAmount,
            denial_reason: null, denial_codes: '{}', document_urls: '{}',
            notes: 'Payment issued', actor: 'seed', metadata: JSON.stringify({ currency }),
            created_at: new Date(eventTime).toISOString(),
          })

          // Closed event
          eventTime += randInt(1, 7) * 86400000
          claimEventRows.push({
            id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'closed', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: eligibleAmount, deductible_applied: dedApplied,
            coinsurance_applied: coinsuranceApplied, approved_amount: approvedAmount,
            denial_reason: null, denial_codes: '{}', document_urls: '{}',
            notes: 'Claim closed', actor: 'seed', metadata: JSON.stringify({}),
            created_at: new Date(eventTime).toISOString(),
          })

          // Claim payments — multi-payment for large claims
          if (approvedAmount > 0) {
            const isMultiPayment = approvedAmount > 3000 && rand() > 0.5
            if (isMultiPayment) {
              // Split into 2–3 payments
              const splits = rand() > 0.5 ? [0.6, 0.4] : [0.5, 0.35, 0.15]
              let payDate = new Date(eventTime)
              for (const split of splits) {
                const payAmt = parseFloat((approvedAmount * split).toFixed(2))
                if (payAmt < 1) continue
                payDate = new Date(payDate.getTime() + randInt(1, 14) * 86400000)
                claimPaymentRows.push({
                  id: uuid(), claim_id: claimId, claim_event_id: payEventId,
                  policy_id: policyId || pick(policyIds) || uuid(),
                  user_id: userId,
                  payee_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
                  payee_type: pick(['insured','insured','insured','provider']),
                  payee_account_ref: `****${randInt(1000, 9999)}`,
                  amount: payAmt, currency,
                  payment_method: pick(PAYMENT_METHODS),
                  payment_status: 'completed',
                  scheduled_date: payDate.toISOString().slice(0, 10),
                  issued_date: payDate.toISOString().slice(0, 10),
                  cleared_date: addDays(payDate.toISOString().slice(0, 10), randInt(1, 5)),
                  reference_number: `REF-${randInt(1000000000, 9999999999)}`,
                  notes: `seed:split payment ${splits.indexOf(split) + 1}/${splits.length}`,
                  created_at: payDate.toISOString(),
                  updated_at: payDate.toISOString(),
                })
              }
            } else {
              // Single payment
              const payDate = new Date(eventTime + randInt(1, 7) * 86400000)
              if (policyId) {
                claimPaymentRows.push({
                  id: uuid(), claim_id: claimId, claim_event_id: payEventId,
                  policy_id: policyId,
                  user_id: userId,
                  payee_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
                  payee_type: pick(['insured','insured','provider']),
                  payee_account_ref: `****${randInt(1000, 9999)}`,
                  amount: approvedAmount, currency,
                  payment_method: pick(PAYMENT_METHODS),
                  payment_status: 'completed',
                  scheduled_date: payDate.toISOString().slice(0, 10),
                  issued_date: payDate.toISOString().slice(0, 10),
                  cleared_date: addDays(payDate.toISOString().slice(0, 10), randInt(1, 5)),
                  reference_number: `REF-${randInt(1000000000, 9999999999)}`,
                  notes: `seed:single payment`,
                  created_at: payDate.toISOString(),
                  updated_at: payDate.toISOString(),
                })
              }
            }
          }

        } else if (outcome === 'denied') {
          const denialIdx = randInt(0, DENIAL_REASONS.length - 1)
          eventTime += randInt(5, 30) * 86400000
          claimEventRows.push({
            id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'denied', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: 0, deductible_applied: 0, coinsurance_applied: 0, approved_amount: 0,
            denial_reason: DENIAL_REASONS[denialIdx],
            denial_codes: DENIAL_CODES[denialIdx] || '{EXC-999}',
            document_urls: '{}',
            notes: `Claim denied: ${DENIAL_REASONS[denialIdx]}`,
            actor: 'seed', metadata: JSON.stringify({ currency }),
            created_at: new Date(eventTime).toISOString(),
          })
          eventTime += randInt(1, 5) * 86400000
          claimEventRows.push({
            id: uuid(), claim_id: claimId, policy_id: policyId, user_id: userId,
            event_type: 'closed', occurred_at: new Date(eventTime).toISOString(),
            submitted_amount: totalAmount,
            eligible_amount: 0, deductible_applied: 0, coinsurance_applied: 0, approved_amount: 0,
            denial_reason: DENIAL_REASONS[denialIdx], denial_codes: '{}', document_urls: '{}',
            notes: 'Claim closed - denied', actor: 'seed', metadata: JSON.stringify({}),
            created_at: new Date(eventTime).toISOString(),
          })
        }
      }

      if ((i + 1) % 10000 === 0) progress('generating claims', i + 1, CLAIM_COUNT)
    }
    progress('generating claims', CLAIM_COUNT, CLAIM_COUNT)

    // Insert claims
    console.log('\n  Inserting claims...')
    for (let i = 0; i < claimRows.length; i += 500) {
      const batch = claimRows.slice(i, i + 500)
      await batchInsert(client, 'claims',
        ['id','user_id','pet_id','service_date','deadline_date','visit_title','invoice_number',
         'clinic_name','clinic_address','diagnosis','total_amount','line_items','filing_status',
         'filing_deadline_days','filed_date','approved_date','reimbursed_amount','paid_date',
         'visit_notes','created_at','pdf_path','sent_reminders','expense_category','medication_ids'],
        batch
      )
      progress('  claims inserted', i + batch.length, claimRows.length)
    }
    console.log()

    // Insert claim events
    console.log('  Inserting claim events...')
    for (let i = 0; i < claimEventRows.length; i += 500) {
      const batch = claimEventRows.slice(i, i + 500)
      await batchInsert(client, 'claim_events',
        ['id','claim_id','policy_id','user_id','event_type','occurred_at',
         'submitted_amount','eligible_amount','deductible_applied','coinsurance_applied',
         'approved_amount','denial_reason','denial_codes','document_urls','notes','actor',
         'metadata','created_at'],
        batch
      )
      progress('  events inserted', i + batch.length, claimEventRows.length)
    }
    console.log()

    // Insert claim payments
    if (claimPaymentRows.length > 0) {
      console.log('  Inserting claim payments...')
      // Filter out any payments referencing non-existent policy_ids
      const validPolicyIds = new Set(policyIds)
      const validPayments = claimPaymentRows.filter(p => validPolicyIds.has(p.policy_id))
      for (let i = 0; i < validPayments.length; i += 500) {
        const batch = validPayments.slice(i, i + 500)
        await batchInsert(client, 'claim_payments',
          ['id','claim_id','claim_event_id','policy_id','user_id','payee_name','payee_type',
           'payee_account_ref','amount','currency','payment_method','payment_status',
           'scheduled_date','issued_date','cleared_date','reference_number','notes',
           'created_at','updated_at'],
          batch
        )
        progress('  payments inserted', i + batch.length, validPayments.length)
      }
      console.log()
    }

    console.log(`\n  ✓ ${claimRows.length.toLocaleString()} claims`)
    console.log(`  ✓ ${claimEventRows.length.toLocaleString()} claim events`)
    console.log(`  ✓ ${claimPaymentRows.filter(p => new Set(policyIds).has(p.policy_id)).length.toLocaleString()} claim payments\n`)

    // -----------------------------------------------------------------------
    // 8. Final row counts
    // -----------------------------------------------------------------------
    console.log('📊 Final row counts:')
    const tables = [
      'territories','products','coverages','providers',
      'profiles','pets','policies','policy_quotes',
      'endorsements','claims','claim_events','claim_payments',
    ]
    for (const t of tables) {
      const res = await client.query(`SELECT count(*) FROM public.${t}`)
      console.log(`  ${t.padEnd(22)} ${parseInt(res.rows[0].count).toLocaleString().padStart(8)}`)
    }

    console.log('\n✅ Seed complete!\n')

  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message)
  console.error(err.stack)
  process.exit(1)
})
