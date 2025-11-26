require('dotenv').config({ path: 'server/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugAl() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 DEBUGGING AL\'S DUPLICATE SMS ISSUE')
  console.log('='.repeat(80))

  // Find Al by phone number
  const phoneVariants = ['(714) 342-1731', '+17143421731', '7143421731', '714-342-1731']

  console.log('\n1️⃣ SEARCHING FOR AL\'S ACCOUNT')
  console.log('Phone variants:', phoneVariants.join(', '))

  let user = null
  for (const phone of phoneVariants) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .single()

    if (data) {
      user = data
      console.log(`✅ Found user with phone: ${phone}`)
      break
    }
  }

  if (!user) {
    console.log('❌ User not found with any phone variant')
    console.log('\nLet me search all profiles with "714" in phone...')
    const { data: allWith714 } = await supabase
      .from('profiles')
      .select('id, phone, full_name')
      .ilike('phone', '%714%')

    console.log('Profiles with 714:', allWith714)
    return
  }

  console.log('\n📋 AL\'S PROFILE:')
  console.log('  User ID:', user.id)
  console.log('  Name:', user.full_name)
  console.log('  Phone:', user.phone)
  console.log('  Email:', user.email)

  // Get Al's pets
  console.log('\n2️⃣ AL\'S PETS')
  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', user.id)

  console.log(`Found ${pets?.length || 0} pets:`)
  pets?.forEach(pet => {
    console.log(`  - ${pet.name} (ID: ${pet.id})`)
  })

  // Find Jaeger
  const jaeger = pets?.find(p => p.name.toLowerCase() === 'jaeger')
  if (!jaeger) {
    console.log('❌ Jaeger not found!')
    return
  }

  console.log(`\n✅ Found Jaeger (ID: ${jaeger.id})`)

  // Get Jaeger's medications
  console.log('\n3️⃣ JAEGER\'S MEDICATIONS')
  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('pet_id', jaeger.id)
    .order('created_at', { ascending: false })

  console.log(`Found ${medications?.length || 0} medications:`)
  medications?.forEach((med, idx) => {
    console.log(`\n  Medication #${idx + 1}:`)
    console.log(`    ID: ${med.id}`)
    console.log(`    Name: ${med.medication_name}`)
    console.log(`    Frequency: ${med.frequency}`)
    console.log(`    Reminder Times: ${JSON.stringify(med.reminder_times)}`)
    console.log(`    Start Date: ${med.start_date}`)
    console.log(`    End Date: ${med.end_date}`)
    console.log(`    Created: ${med.created_at}`)
  })

  // Check for duplicate Apoquel entries
  const apoquelMeds = medications?.filter(m =>
    m.medication_name?.toLowerCase().includes('apoquel')
  )

  console.log(`\n🔍 APOQUEL MEDICATIONS: ${apoquelMeds?.length || 0}`)
  if (apoquelMeds && apoquelMeds.length > 1) {
    console.log('⚠️  WARNING: DUPLICATE APOQUEL ENTRIES FOUND!')
    console.log('This is likely causing the duplicate SMS!')
    apoquelMeds.forEach((med, idx) => {
      console.log(`\n  Apoquel #${idx + 1}:`)
      console.log(`    ID: ${med.id}`)
      console.log(`    Reminder Enabled: ${med.reminder_enabled}`)
      console.log(`    Reminder Time: ${med.reminder_time}`)
    })
  }

  // Check medication reminder logs
  console.log('\n4️⃣ RECENT SMS/REMINDER ACTIVITY')
  console.log('Checking for recent reminders...')

  // Check if there's a logs table
  const { data: logs } = await supabase
    .from('medication_reminder_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
    .then(r => r, () => ({ data: null }))

  if (logs) {
    console.log(`Found ${logs.length} log entries:`)
    logs.forEach(log => {
      console.log(`  ${log.created_at}: ${log.medication_name} - ${log.status}`)
    })
  } else {
    console.log('  No medication_reminder_logs table found')
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY:')
  console.log('='.repeat(80))
  console.log(`Total pets: ${pets?.length || 0}`)
  console.log(`Total medications for Jaeger: ${medications?.length || 0}`)
  console.log(`Apoquel entries: ${apoquelMeds?.length || 0}`)

  // Check for duplicate reminder times
  if (apoquelMeds && apoquelMeds.length > 0) {
    const reminderTimes = apoquelMeds[0].reminder_times
    if (Array.isArray(reminderTimes)) {
      console.log(`\nApoquel reminder_times array length: ${reminderTimes.length}`)
      console.log(`Reminder times: ${JSON.stringify(reminderTimes)}`)

      // Check for duplicates
      const uniqueTimes = new Set(reminderTimes)
      if (uniqueTimes.size < reminderTimes.length) {
        console.log(`\n⚠️  WARNING: DUPLICATE TIMES IN reminder_times ARRAY!`)
        console.log(`Unique times: ${uniqueTimes.size}, Total times: ${reminderTimes.length}`)
        console.log(`This could cause ${reminderTimes.length - uniqueTimes.size} extra SMS per reminder!`)
      }
    }
  }

  if (apoquelMeds && apoquelMeds.length > 1) {
    console.log(`\n🎯 ROOT CAUSE: ${apoquelMeds.length} duplicate Apoquel entries!`)
    console.log('Each reminder fires separately, causing duplicate SMS.')
    console.log('\nRECOMMENDED FIX: Delete duplicate medication entries, keep only 1')
  }

  console.log('='.repeat(80) + '\n')
}

debugAl().catch(console.error)
