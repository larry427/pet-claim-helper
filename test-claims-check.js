import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkClaims() {
  console.log('Checking claims in database...\n')

  // Get all claims with pets and profiles
  const { data: claims, error } = await supabase
    .from('claims')
    .select('*, pets(name, filing_deadline_days), profiles(email)')
    .in('filing_status', ['not_filed', 'filed'])

  if (error) {
    console.error('Error fetching claims:', error)
    return
  }

  console.log(`Total claims found: ${claims?.length || 0}`)

  if (claims && claims.length > 0) {
    console.log('\nClaim details:')
    claims.forEach(claim => {
      console.log(`\n  Claim #${claim.id}`)
      console.log(`  - Pet: ${claim.pets?.name || 'Unknown'}`)
      console.log(`  - Filing deadline days: ${claim.pets?.filing_deadline_days || claim.filing_deadline_days || 'Not set'}`)
      console.log(`  - Service date: ${claim.service_date || 'Not set'}`)
      console.log(`  - Filing status: ${claim.filing_status}`)
      console.log(`  - User email: ${claim.profiles?.email || 'Unknown'}`)
      console.log(`  - Sent reminders: ${JSON.stringify(claim.sent_reminders || {})}`)
    })
  }

  // Check pets to see filing deadline days
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, name, filing_deadline_days')

  if (!petsError && pets) {
    console.log(`\n\nTotal pets: ${pets.length}`)
    console.log('Pets with filing deadline days set:')
    pets.forEach(pet => {
      if (pet.filing_deadline_days) {
        console.log(`  - ${pet.name}: ${pet.filing_deadline_days} days`)
      }
    })
  }
}

checkClaims().then(() => process.exit(0))
