import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createMissingDose() {
  console.log('Creating missing dose for test medication...\n')

  const MEDICATION_ID = '31716620-86bd-4889-b707-778c24c24749'
  const LARRY_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'
  const BO_PET_ID = '78e714d6-473d-4a00-9579-8fffb8a24292'

  // Create dose scheduled for 18:06 PST today
  const nowPST = DateTime.now().setZone('America/Los_Angeles')
  const scheduledTime = nowPST.set({ hour: 18, minute: 6, second: 0 }).toISO()

  console.log('Creating dose for:')
  console.log('  Medication ID:', MEDICATION_ID)
  console.log('  User ID:', LARRY_USER_ID)
  console.log('  Pet ID:', BO_PET_ID)
  console.log('  Scheduled time:', scheduledTime)
  console.log()

  const { data: dose, error: doseError} = await supabase
    .from('medication_doses')
    .insert({
      medication_id: MEDICATION_ID,
      user_id: LARRY_USER_ID,
      scheduled_time: scheduledTime,
      status: 'pending'
    })
    .select()
    .single()

  if (doseError) {
    console.error('ERROR creating dose:', doseError)
    process.exit(1)
  }

  console.log('SUCCESS: Dose created')
  console.log('  Dose ID:', dose.id)
  console.log('  Status:', dose.status)
  console.log('  Scheduled time:', dose.scheduled_time)
  console.log()
  console.log('✅ You can now test the deep link!')
  console.log('   Click the SMS link and mark the dose as given.')
  console.log()
}

createMissingDose()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('FAILED:', err)
    process.exit(1)
  })
