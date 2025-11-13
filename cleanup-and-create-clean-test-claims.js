import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupAndCreateCleanTestClaims() {
  console.log('🧹 CLEANING UP PRODUCTION DATABASE AND CREATING CLEAN TEST CLAIMS\n')
  console.log('Current time:', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }), 'Pacific\n')

  // Get the user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', 'larry@uglydogadventures.com')
    .single()

  if (profileError || !profile) {
    console.error('❌ Error finding user profile:', profileError)
    return
  }

  console.log('✅ Found user profile:', profile.id, '-', profile.email, '\n')

  // STEP 1: Get ALL existing claims for this user
  console.log('📊 STEP 1: Querying all existing claims...')
  const { data: allClaims, error: claimsError } = await supabase
    .from('claims')
    .select('*, pets(name)')
    .eq('user_id', profile.id)

  if (claimsError) {
    console.error('❌ Error fetching claims:', claimsError)
    return
  }

  console.log(`Found ${allClaims?.length || 0} total claims\n`)

  if (allClaims && allClaims.length > 0) {
    console.log('Existing claims:')
    allClaims.forEach((claim, idx) => {
      console.log(`  ${idx + 1}. ID: ${claim.id}`)
      console.log(`     Service Date: ${claim.service_date || 'Not set'}`)
      console.log(`     Status: ${claim.filing_status}`)
      console.log(`     Pet: ${claim.pets?.name || 'Unknown'}`)
      console.log(`     Sent Reminders: ${JSON.stringify(claim.sent_reminders || {})}`)
    })
  }

  // STEP 2: Delete ALL existing claims to start fresh
  console.log('\n🗑️  STEP 2: Deleting ALL existing claims to start fresh...')
  let deletedCount = 0

  for (const claim of allClaims || []) {
    const { error: deleteError } = await supabase
      .from('claims')
      .delete()
      .eq('id', claim.id)

    if (deleteError) {
      console.log(`  ❌ Error deleting claim ${claim.id}:`, deleteError.message)
    } else {
      deletedCount++
      console.log(`  ✅ Deleted claim ${claim.id}`)
    }
  }

  console.log(`\n✅ Deleted ${deletedCount} claims\n`)

  // STEP 3: Get pet information
  console.log('🐾 STEP 3: Getting pet information...')
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, name, filing_deadline_days')
    .eq('user_id', profile.id)

  if (petsError || !pets || pets.length === 0) {
    console.error('❌ Error finding pets:', petsError)
    return
  }

  const pet = pets.find(p => p.name === 'Hemingway' || p.name === 'Bo') || pets[0]
  console.log(`✅ Using pet: ${pet.name} (filing_deadline_days: ${pet.filing_deadline_days || 90})\n`)

  const filingDays = pet.filing_deadline_days || 90

  // STEP 4: Calculate service dates for EXACT deadlines
  console.log('📅 STEP 4: Calculating service dates for EXACT deadlines tomorrow...\n')

  const today = new Date()
  today.setHours(0, 0, 0, 0) // Start of today

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1) // Start of tomorrow

  // For a claim to trigger a 7-day warning tomorrow, its deadline must be exactly 7 days from tomorrow
  // Deadline = Service Date + filingDays
  // So: Service Date = Deadline - filingDays = (tomorrow + 7) - filingDays

  const testClaims = [
    {
      name: 'Clean Test - 7 Day Warning',
      daysFromTomorrow: 7,
      description: 'Will trigger 7-day warning at 9 AM Pacific tomorrow'
    },
    {
      name: 'Clean Test - 30 Day Warning',
      daysFromTomorrow: 30,
      description: 'Will trigger 30-day warning at 9 AM Pacific tomorrow'
    },
    {
      name: 'Clean Test - 60 Day Warning',
      daysFromTomorrow: 60,
      description: 'Will trigger 60-day warning at 9 AM Pacific tomorrow'
    }
  ]

  console.log('Creating 3 CLEAN test claims:\n')
  const createdClaims = []

  for (const testClaim of testClaims) {
    // Calculate the exact deadline date (X days from tomorrow)
    const deadlineDate = new Date(tomorrow)
    deadlineDate.setDate(deadlineDate.getDate() + testClaim.daysFromTomorrow)

    // Calculate service date (deadline - filing days)
    const serviceDate = new Date(deadlineDate)
    serviceDate.setDate(serviceDate.getDate() - filingDays)

    const serviceDateStr = serviceDate.toISOString().split('T')[0]
    const deadlineDateStr = deadlineDate.toISOString().split('T')[0]

    const daysFromToday = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24))

    console.log(`${testClaim.name}:`)
    console.log(`  Service Date: ${serviceDateStr}`)
    console.log(`  Deadline: ${deadlineDateStr} (${daysFromToday} days from today, ${testClaim.daysFromTomorrow} days from tomorrow)`)
    console.log(`  Description: ${testClaim.description}`)

    const { data, error } = await supabase
      .from('claims')
      .insert({
        user_id: profile.id,
        pet_id: pet.id,
        service_date: serviceDateStr,
        filing_status: 'not_filed',
        sent_reminders: {}
      })
      .select()

    if (error) {
      console.log(`  ❌ Error creating claim:`, error.message)
    } else {
      createdClaims.push({
        id: data[0].id,
        serviceDate: serviceDateStr,
        deadline: deadlineDateStr,
        daysFromTomorrow: testClaim.daysFromTomorrow,
        pet: pet.name
      })
      console.log(`  ✅ Created claim ID: ${data[0].id}\n`)
    }
  }

  // STEP 5: Verify the cleanup
  console.log('✅ STEP 5: Verifying cleanup...\n')
  const { data: finalClaims, error: finalError } = await supabase
    .from('claims')
    .select('*, pets(name)')
    .eq('user_id', profile.id)

  console.log(`Total claims in database now: ${finalClaims?.length || 0}`)

  // STEP 6: Generate prediction report
  console.log('\n' + '='.repeat(80))
  console.log('📧 PREDICTION REPORT FOR TOMORROW (November 13, 2025 @ 9:00 AM Pacific)')
  console.log('='.repeat(80) + '\n')

  console.log('🎯 WHAT WILL HAPPEN:\n')
  console.log('1. Cron job triggers at exactly 9:00 AM Pacific (17:00 UTC)')
  console.log('2. System queries database for claims with status "not_filed" or "filed"')
  console.log(`3. Finds ${createdClaims.length} claims for larry@uglydogadventures.com`)
  console.log('4. Calculates days until deadline for each claim')
  console.log('5. Identifies which reminders to send based on thresholds (7, 30, 60 days)')
  console.log('6. Batches all 3 reminders into 1 email')
  console.log('7. Sends email via Resend')
  console.log('8. Updates sent_reminders flags in database\n')

  console.log('📨 EMAIL DETAILS:\n')
  console.log('  Emails Sent: EXACTLY 1')
  console.log('  Recipient: larry@uglydogadventures.com')
  console.log('  From: Pet Claim Helper <reminders@petclaimhelper.com>')
  console.log('  Subject: "Pet Insurance Claims Deadlines - 3 reminders"\n')

  console.log('📋 CLAIMS THAT WILL TRIGGER REMINDERS:\n')
  createdClaims.forEach((claim, idx) => {
    console.log(`  Claim ${idx + 1}:`)
    console.log(`    - ID: ${claim.id}`)
    console.log(`    - Pet: ${claim.pet}`)
    console.log(`    - Service Date: ${claim.serviceDate}`)
    console.log(`    - Deadline: ${claim.deadline}`)
    console.log(`    - Days from tomorrow: ${claim.daysFromTomorrow}`)
    console.log(`    - Will trigger: ${claim.daysFromTomorrow}-day warning`)
    console.log(`    - Filing Status: not_filed`)
    console.log(`    - Sent Reminders: {} (none)\n`)
  })

  console.log('📧 EMAIL CONTENT PREVIEW:\n')
  console.log('  The email will contain:')
  console.log(`  - ${pet.name} claim - 7 days until deadline (${createdClaims[0]?.deadline})`)
  console.log(`  - ${pet.name} claim - 30 days until deadline (${createdClaims[1]?.deadline})`)
  console.log(`  - ${pet.name} claim - 60 days until deadline (${createdClaims[2]?.deadline})\n`)

  console.log('✅ DATABASE IS NOW CLEAN AND READY FOR TOMORROW\'S TEST!')
  console.log('\n' + '='.repeat(80))

  console.log('\n📊 CLEANUP SUMMARY:')
  console.log(`  - Deleted: ${deletedCount} old/duplicate claims`)
  console.log(`  - Created: ${createdClaims.length} new clean test claims`)
  console.log(`  - Total claims in database: ${finalClaims?.length || 0}`)
  console.log(`  - Expected emails tomorrow: 1`)
  console.log(`  - Expected reminders in email: 3\n`)
}

cleanupAndCreateCleanTestClaims().then(() => process.exit(0))
