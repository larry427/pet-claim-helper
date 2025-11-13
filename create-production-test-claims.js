import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createProductionTestClaims() {
  console.log('Creating PRODUCTION test claims for tomorrow\'s 9 AM Pacific cron job...\n')
  console.log('NOTE: Current time:', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }), 'Pacific\n')

  // Get the user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'larry@uglydogadventures.com')
    .single()

  if (profileError || !profile) {
    console.error('Error finding user profile:', profileError)
    return
  }

  console.log('Found user profile:', profile.id)

  // Get pets for this user
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, name, filing_deadline_days')
    .eq('user_id', profile.id)

  if (petsError || !pets || pets.length === 0) {
    console.error('Error finding pets:', petsError)
    return
  }

  console.log(`Found ${pets.length} pets for user`)
  const pet = pets.find(p => p.name === 'Bo' || p.name === 'Hemingway') || pets[0]
  console.log(`Using pet: ${pet.name} (filing_deadline_days: ${pet.filing_deadline_days || 90})\n`)

  const filingDays = pet.filing_deadline_days || 90
  const today = new Date()

  // Calculate service dates for claims that will trigger reminders TOMORROW
  // For 7-day warning: deadline should be 7 days from tomorrow
  // Service date = deadline - filingDays
  // Service date = (today + 8 days) - filingDays = today - (filingDays - 8)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const claims = [
    {
      name: 'PRODUCTION Test - 7 Day Warning',
      targetDaysFromTomorrow: 7,
      description: 'Will trigger 7-day deadline warning tomorrow at 9 AM Pacific'
    },
    {
      name: 'PRODUCTION Test - 30 Day Warning',
      targetDaysFromTomorrow: 30,
      description: 'Will trigger 30-day deadline warning tomorrow at 9 AM Pacific'
    },
    {
      name: 'PRODUCTION Test - 60 Day Warning',
      targetDaysFromTomorrow: 60,
      description: 'Will trigger 60-day deadline warning tomorrow at 9 AM Pacific'
    }
  ]

  console.log('Creating claims...')

  for (const claim of claims) {
    // Calculate service date: today - (filingDays - targetDaysFromTomorrow - 1)
    // -1 because we want the deadline to be exactly targetDaysFromTomorrow from tomorrow
    const daysAgo = filingDays - claim.targetDaysFromTomorrow - 1
    const serviceDate = new Date(today)
    serviceDate.setDate(serviceDate.getDate() - daysAgo)
    const serviceDateStr = serviceDate.toISOString().split('T')[0]

    const deadlineDate = new Date(serviceDate)
    deadlineDate.setDate(deadlineDate.getDate() + filingDays)
    const deadlineDateStr = deadlineDate.toISOString().split('T')[0]

    const daysUntilDeadline = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24))

    console.log(`\n  ${claim.name}:`)
    console.log(`    - Service date: ${serviceDateStr} (${daysAgo} days ago)`)
    console.log(`    - Deadline: ${deadlineDateStr} (${daysUntilDeadline} days from now)`)
    console.log(`    - Should trigger: ${claim.targetDaysFromTomorrow}-day warning tomorrow`)

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
      console.error(`    ❌ Error creating claim:`, error)
    } else {
      console.log(`    ✅ Created claim ID: ${data[0].id}`)
    }
  }

  console.log('\n✅ PRODUCTION test claims created successfully!')
  console.log('\nThese claims will trigger deadline reminder emails tomorrow at 9 AM Pacific.')
  console.log('Expected: 1 batched email to larry@uglydogadventures.com with 3 deadline warnings.')
}

createProductionTestClaims().then(() => process.exit(0))
