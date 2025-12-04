const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hyrgqrgeshkgvsfwnzzu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cmdxcmdlc2hrZ3ZzZnduenp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE1NTc1MSwiZXhwIjoyMDc2NzMxNzUxfQ.UsqGmuoOUDdXKwEbY6jMFYq3je1oh9eEgEIbgchcLLw'

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTestMedication() {
  try {
    const { data: profile } = await supabase.from('profiles').select('id, email, phone').eq('email', 'larry@uglydogadventures.com').single()
    console.log('✅ Found Larry:', profile.email, '| Phone:', profile.phone)

    const { data: pets } = await supabase.from('pets').select('id, name, species').eq('user_id', profile.id).limit(1).single()
    console.log('✅ Using pet:', pets.name, `(${pets.species})`)

    const today = '2025-12-03'
    const tomorrow = '2025-12-04'

    const { data: medication, error: medError } = await supabase
      .from('medications')
      .insert({
        user_id: profile.id,
        pet_id: pets.id,
        medication_name: 'SMS Test',
        dosage: '1 pill',
        frequency: 'daily',
        start_date: today,
        end_date: tomorrow,
        reminder_times: ['15:52']
      })
      .select()
      .single()

    if (medError) {
      console.error('❌ Failed to create medication:', medError)
      return
    }

    console.log('✅ Medication created:', medication.id)
    console.log('   Reminder time: 3:52 PM PST')

    const scheduledTime = `${today}T15:52:00-08:00`
    const crypto = require('crypto')
    
    function generateShortCode() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let code = ''
      const randomBytes = crypto.randomBytes(8)
      for (let i = 0; i < 8; i++) {
        code += chars[randomBytes[i] % chars.length]
      }
      return code
    }

    const { data: dose } = await supabase
      .from('medication_doses')
      .insert({
        medication_id: medication.id,
        user_id: profile.id,
        scheduled_time: scheduledTime,
        status: 'pending',
        one_time_token: crypto.randomUUID(),
        token_expires_at: new Date(Date.now() + 86400000).toISOString(),
        short_code: generateShortCode()
      })
      .select()
      .single()

    console.log('✅ Dose created:', dose.id)
    console.log('   SMS URL:', `https://pet-claim-helper.vercel.app/dose/${dose.short_code}`)
    console.log('')
    console.log('🔔 SMS will fire at 3:52 PM PST')
    console.log('='.repeat(60))
    console.log('MEDICATION ID:', medication.id)
    console.log('='.repeat(60))

  } catch (err) {
    console.error('❌ Error:', err)
  }
}

createTestMedication()
