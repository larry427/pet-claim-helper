import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestMedication() {
  console.log('Creating test medication for SMS verification...\n')

  const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'
  const BO_PET_ID = '78e714d6-473d-4a00-9579-8fffb8a24292'

  // Get current PST time and add 2 minutes
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const fireTime = nowPST.plus({ minutes: 2 })
  const reminderTime = fireTime.toFormat('HH:mm')
  const today = nowPST.toISODate()
  const tomorrow = nowPST.plus({ days: 1 }).toISODate()

  console.log('Current PST time:', nowPST.toISO())
  console.log('SMS will fire at:', fireTime.toISO())
  console.log('Reminder time stored:', reminderTime)
  console.log()

  // Verify Larry's profile has phone number
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, phone, sms_opt_in')
    .eq('id', LARRY_USER_ID)
    .single()

  if (profileError) {
    console.error('ERROR: Could not fetch profile:', profileError)
    process.exit(1)
  }

  console.log('User Profile:')
  console.log('  Email:', profile.email)
  console.log('  Phone:', profile.phone || 'NOT SET')
  console.log('  SMS Opt-in:', profile.sms_opt_in)
  console.log()

  if (!profile.phone) {
    console.error('ERROR: User does not have a phone number set!')
    process.exit(1)
  }

  // Create the test medication
  const { data: medication, error: medError } = await supabase
    .from('medications')
    .insert({
      user_id: LARRY_USER_ID,
      pet_id: BO_PET_ID,
      medication_name: 'SMS System Test',
      dosage: '1 pill',
      frequency: '1x daily',
      reminder_times: [reminderTime],
      start_date: today,
      end_date: tomorrow,
    })
    .select()
    .single()

  if (medError) {
    console.error('ERROR creating medication:', medError)
    process.exit(1)
  }

  console.log('SUCCESS: Test medication created')
  console.log('  Medication ID:', medication.id)
  console.log('  Pet: Bo')
  console.log('  Medication: SMS System Test')
  console.log('  Reminder time:', reminderTime, 'PST')
  console.log('  Start date:', today)
  console.log('  End date:', tomorrow)
  console.log()
  console.log('SMS SHOULD FIRE AT:', fireTime.toLocaleString(DateTime.DATETIME_FULL))
  console.log('Phone number:', profile.phone)
  console.log()
  console.log('Waiting for SMS...')
  console.log('Check your phone at', fireTime.toFormat('h:mm a'), 'PST')
  console.log()
  console.log('To delete this test medication after testing:')
  console.log('  DELETE FROM medications WHERE id =', medication.id + ';')
}

createTestMedication()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('FAILED:', err)
    process.exit(1)
  })
