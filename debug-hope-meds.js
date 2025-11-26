import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugHopeMedications() {
  console.log('🔍 DEBUGGING HOPE\'S MEDICATIONS')
  console.log('='.repeat(80))

  // Step 1: Find Hope
  console.log('\n📋 STEP 1: Finding Hope in pets table')
  console.log('-'.repeat(80))

  const { data: hope, error: hopeError } = await supabase
    .from('pets')
    .select('*')
    .ilike('name', 'Hope')
    .single()

  if (hopeError || !hope) {
    console.log('❌ Hope not found in pets table:', hopeError?.message)
    return
  }

  console.log('✅ Found Hope:')
  console.log('  ID:', hope.id)
  console.log('  Name:', hope.name)
  console.log('  Species:', hope.species)
  console.log('  User ID:', hope.user_id)

  // Step 2: Check medications for Hope
  console.log('\n📋 STEP 2: Looking for medications for Hope')
  console.log('-'.repeat(80))

  const { data: meds, error: medsError } = await supabase
    .from('medications')
    .select('*')
    .eq('pet_id', hope.id)
    .order('created_at', { ascending: false })

  if (medsError) {
    console.log('❌ Error querying medications:', medsError.message)
    return
  }

  if (!meds || meds.length === 0) {
    console.log('❌ NO MEDICATIONS FOUND FOR HOPE!')
    console.log('   This means:')
    console.log('   - Medication was never created in database')
    console.log('   - OR medication was created but deleted')
    console.log('   - OR pet_id doesn\'t match')
    return
  }

  console.log(`✅ Found ${meds.length} medication(s) for Hope:\n`)

  for (const med of meds) {
    console.log('─'.repeat(80))
    console.log('Medication ID:', med.id)
    console.log('Name:', med.medication_name)
    console.log('Dosage:', med.dosage)
    console.log('Frequency:', med.frequency)
    console.log('Reminder times:', med.reminder_times)
    console.log('Start date:', med.start_date)
    console.log('End date:', med.end_date)
    console.log('Created at:', med.created_at)
    console.log('Pet ID:', med.pet_id, med.pet_id === hope.id ? '✅ MATCHES' : '❌ MISMATCH!')
    console.log('User ID:', med.user_id, med.user_id === hope.user_id ? '✅ MATCHES' : '❌ MISMATCH!')
  }

  // Step 3: Check if medication has doses
  console.log('\n📋 STEP 3: Checking for doses')
  console.log('-'.repeat(80))

  for (const med of meds) {
    const { data: doses, error: dosesError } = await supabase
      .from('medication_doses')
      .select('*')
      .eq('medication_id', med.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (dosesError) {
      console.log(`❌ Error checking doses for ${med.medication_name}:`, dosesError.message)
    } else if (!doses || doses.length === 0) {
      console.log(`⚠️  ${med.medication_name}: NO DOSES FOUND`)
    } else {
      console.log(`✅ ${med.medication_name}: ${doses.length} dose(s) found`)
      for (const dose of doses) {
        console.log(`   - ${dose.status} at ${dose.scheduled_time}`)
      }
    }
  }

  // Step 4: Check all medications to compare
  console.log('\n📋 STEP 4: All medications in database (for comparison)')
  console.log('-'.repeat(80))

  const { data: allMeds } = await supabase
    .from('medications')
    .select('id, medication_name, pet_id, pets(name)')
    .order('created_at', { ascending: false })
    .limit(10)

  if (allMeds && allMeds.length > 0) {
    for (const med of allMeds) {
      console.log(`${med.pets?.name || 'Unknown'}: ${med.medication_name} (${med.id})`)
    }
  }

  console.log('\n' + '='.repeat(80))
}

debugHopeMedications().catch(console.error)
