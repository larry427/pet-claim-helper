const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hyrgqrgeshkgvsfwnzzu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cmdxcmdlc2hrZ3ZzZnduenp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE1NTc1MSwiZXhwIjoyMDc2NzMxNzUxfQ.UsqGmuoOUDdXKwEbY6jMFYq3je1oh9eEgEIbgchcLLw'

const supabase = createClient(supabaseUrl, supabaseKey)

async function deleteArya() {
  const petId = 'b05c3a43-0455-47e3-af74-3435a85aef16'
  const userId = '588e3ad4-7017-4ca5-8555-72ba0060ab88'
  
  console.log('🗑️  DELETING ARYA AND ASSOCIATED DATA...\n')

  // 1. Delete medication doses (if any)
  const { error: dosesError } = await supabase
    .from('medication_doses')
    .delete()
    .eq('user_id', userId)
  
  if (dosesError) {
    console.log('❌ Error deleting doses:', dosesError.message)
  } else {
    console.log('✅ Deleted medication doses')
  }

  // 2. Delete medications (if any)
  const { error: medsError } = await supabase
    .from('medications')
    .delete()
    .eq('pet_id', petId)
  
  if (medsError) {
    console.log('❌ Error deleting medications:', medsError.message)
  } else {
    console.log('✅ Deleted medications')
  }

  // 3. Delete claims (if any)
  const { error: claimsError } = await supabase
    .from('claims')
    .delete()
    .eq('pet_id', petId)
  
  if (claimsError) {
    console.log('❌ Error deleting claims:', claimsError.message)
  } else {
    console.log('✅ Deleted claims')
  }

  // 4. Delete pet
  const { error: petError } = await supabase
    .from('pets')
    .delete()
    .eq('id', petId)
  
  if (petError) {
    console.log('❌ Error deleting pet:', petError.message)
  } else {
    console.log('✅ Deleted pet (Arya)')
  }

  // 5. Delete user profile
  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
  
  if (profileError) {
    console.log('❌ Error deleting profile:', profileError.message)
  } else {
    console.log('✅ Deleted user profile (fixit.bcarrillo@gmail.com)')
  }

  // 6. Delete auth user (requires admin API)
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  
  if (authError) {
    console.log('❌ Error deleting auth user:', authError.message)
  } else {
    console.log('✅ Deleted auth user account')
  }

  console.log('\n✅ ALL DATA DELETED')
}

deleteArya().catch(console.error)
