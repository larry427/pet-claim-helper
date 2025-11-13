import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestClaims() {
  console.log('Creating test claims with upcoming deadlines...\n')

  // First, get the user ID for larry@uglydogadventures.com
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
  const pet = pets[0]
  console.log(`Using pet: ${pet.name} (filing_deadline_days: ${pet.filing_deadline_days || 90})`)

  const today = new Date()
  const filingDays = pet.filing_deadline_days || 90

  // Calculate service dates that will trigger 7, 30, and 60 day warnings
  // For 7 day warning: service_date should be (filingDays - 7) days ago
  // For 30 day warning: service_date should be (filingDays - 30) days ago
  // For 60 day warning: service_date should be (filingDays - 60) days ago

  const claims = [
    {
      name: 'Test Claim - 7 Day Warning',
      daysAgo: filingDays - 7,
      description: 'This claim will trigger a 7-day deadline warning'
    },
    {
      name: 'Test Claim - 30 Day Warning',
      daysAgo: filingDays - 30,
      description: 'This claim will trigger a 30-day deadline warning'
    },
    {
      name: 'Test Claim - 60 Day Warning',
      daysAgo: filingDays - 60,
      description: 'This claim will trigger a 60-day deadline warning'
    }
  ]

  console.log('\nCreating claims...')

  for (const claim of claims) {
    const serviceDate = new Date(today)
    serviceDate.setDate(serviceDate.getDate() - claim.daysAgo)
    const serviceDateStr = serviceDate.toISOString().split('T')[0]

    const deadlineDate = new Date(serviceDate)
    deadlineDate.setDate(deadlineDate.getDate() + filingDays)
    const deadlineDateStr = deadlineDate.toISOString().split('T')[0]

    const daysUntilDeadline = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24))

    console.log(`\n  ${claim.name}:`)
    console.log(`    - Service date: ${serviceDateStr} (${claim.daysAgo} days ago)`)
    console.log(`    - Deadline: ${deadlineDateStr} (${daysUntilDeadline} days from now)`)

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

  console.log('\n✅ Test claims created successfully!')
  console.log('\nYou can now trigger the deadline reminders endpoint to send emails.')
}

createTestClaims().then(() => process.exit(0))
