import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugDoseMarking() {
  console.log('🔍 DOSE MARKING DEBUG')
  console.log('='.repeat(80))

  // Get medication
  const { data: med, error: medError } = await supabase
    .from('medications')
    .select('*')
    .eq('medication_name', 'testbylarrypill')
    .single()

  if (medError) {
    console.error('❌ Error fetching medication:', medError)
    return
  }

  if (!med) {
    console.log('❌ No medication found with name "testbylarrypill"')
    return
  }

  console.log('\n💊 MEDICATION:')
  console.log('ID:', med.id)
  console.log('Name:', med.medication_name)
  console.log('User ID:', med.user_id)
  console.log('Pet ID:', med.pet_id)
  console.log('Frequency:', med.frequency)
  console.log('Start date:', med.start_date)
  console.log('End date:', med.end_date)

  // Calculate expected number of doses
  const startDate = new Date(med.start_date)
  const endDate = new Date(med.end_date || med.start_date)
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
  const dosesPerDay = med.frequency === '1x daily' ? 1 : med.frequency === '2x daily' ? 2 : 3
  const totalExpectedDoses = daysDiff * dosesPerDay

  console.log('\n📊 EXPECTED DOSES:')
  console.log('Days:', daysDiff)
  console.log('Doses per day:', dosesPerDay)
  console.log('Total expected:', totalExpectedDoses)

  // Get all doses for this medication
  const { data: doses, error: dosesError } = await supabase
    .from('medication_doses')
    .select('*')
    .eq('medication_id', med.id)
    .order('scheduled_time', { ascending: true })

  if (dosesError) {
    console.error('❌ Error fetching doses:', dosesError)
    return
  }

  console.log('\n💉 DOSE RECORDS:')
  if (!doses || doses.length === 0) {
    console.log('❌ NO DOSES FOUND - This is BUG #2!')
    console.log('   The dose was never created OR was deleted')
  } else {
    console.log(`Found ${doses.length} dose record(s):\n`)
    doses.forEach((dose, idx) => {
      console.log(`Dose ${idx + 1}:`)
      console.log('  ID:', dose.id)
      console.log('  Status:', dose.status)
      console.log('  Scheduled time:', dose.scheduled_time)
      console.log('  Given time:', dose.given_time || 'NULL')
      console.log('  Created at:', dose.created_at)
      console.log('')
    })

    const givenDoses = doses.filter(d => d.status === 'given')
    const pendingDoses = doses.filter(d => d.status === 'pending')

    console.log('📈 DOSE COUNTS:')
    console.log('Total doses:', doses.length)
    console.log('Given:', givenDoses.length)
    console.log('Pending:', pendingDoses.length)

    if (givenDoses.length === 0) {
      console.log('\n❌ BUG #2 FOUND: No doses marked as "given"')
      console.log('   The mark-given endpoint failed silently OR')
      console.log('   The success message is shown before the DB update')
    } else if (givenDoses.length > 0) {
      console.log('\n✅ Doses ARE marked as given in database')
      console.log('❌ BUG #2 FOUND: Frontend progress calculation is wrong')
      console.log('   The frontend is not reading the dose status correctly')
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 NEXT: Check the mark-given endpoint auth logic')
  console.log('='.repeat(80))
}

debugDoseMarking().catch(console.error)
