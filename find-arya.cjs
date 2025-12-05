const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hyrgqrgeshkgvsfwnzzu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cmdxcmdlc2hrZ3ZzZnduenp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE1NTc1MSwiZXhwIjoyMDc2NzMxNzUxfQ.UsqGmuoOUDdXKwEbY6jMFYq3je1oh9eEgEIbgchcLLw'

const supabase = createClient(supabaseUrl, supabaseKey)

async function findArya() {
  console.log('🔍 FINDING ARYA AND ASSOCIATED DATA...\n')

  // Find Arya
  const { data: arya, error: aryaError } = await supabase
    .from('pets')
    .select('*')
    .eq('name', 'Arya')
    .single()

  if (aryaError || !arya) {
    console.log('❌ Arya not found:', aryaError?.message)
    return
  }

  console.log('🐾 PET: Arya')
  console.log('   ID:', arya.id)
  console.log('   User ID:', arya.user_id)
  console.log('   Species:', arya.species)
  console.log('   Insurance:', arya.insurance_company)
  console.log('')

  const userId = arya.user_id
  const petId = arya.id

  // Find user
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (profile) {
    console.log('👤 USER PROFILE:')
    console.log('   ID:', profile.id)
    console.log('   Email:', profile.email)
    console.log('   Created:', profile.created_at)
    console.log('')
  }

  // Find claims
  const { data: claims } = await supabase
    .from('claims')
    .select('id, service_date, total_amount, clinic_name')
    .eq('pet_id', petId)

  console.log('📄 CLAIMS:', claims?.length || 0)
  if (claims && claims.length > 0) {
    claims.forEach(c => {
      console.log('   -', c.id, '|', c.service_date, '|', c.clinic_name, '| $' + c.total_amount)
    })
  }
  console.log('')

  // Find medications
  const { data: medications } = await supabase
    .from('medications')
    .select('id, medication_name, start_date, end_date')
    .eq('pet_id', petId)

  console.log('💊 MEDICATIONS:', medications?.length || 0)
  if (medications && medications.length > 0) {
    medications.forEach(m => {
      console.log('   -', m.id, '|', m.medication_name, '|', m.start_date, 'to', m.end_date)
    })
  }
  console.log('')

  // Find doses
  const { data: doses } = await supabase
    .from('medication_doses')
    .select('id')
    .eq('user_id', userId)

  console.log('💉 MEDICATION DOSES:', doses?.length || 0)
  console.log('')

  console.log('='.repeat(60))
  console.log('SUMMARY - WILL DELETE:')
  console.log('='.repeat(60))
  console.log('1 Pet (Arya)')
  console.log((claims?.length || 0) + ' Claims')
  console.log((medications?.length || 0) + ' Medications')
  console.log((doses?.length || 0) + ' Medication Doses')
  console.log('1 User Profile (' + (profile?.email || 'unknown') + ')')
  console.log('='.repeat(60))
}

findArya().catch(console.error)
