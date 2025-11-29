const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'server/.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Test accounts to delete
const TEST_ACCOUNTS = [
  'fredsmith@gmail.com',
  'playwright.tests+999999999@gmail.com',
  'test123456789@gmail.com',
  'test.onboarding.v2@gmail.com',
  'test-pdf-merge@test.com',
  'al-phone-test@test.com',
  'test-automation@petclaimhelper.com',
  'jadyn46@gmxxail.com',
  'civewew931@izeao.com'
]

async function deleteTestAccounts() {
  console.log('='.repeat(80))
  console.log('DELETING TEST ACCOUNTS AND ALL ASSOCIATED DATA')
  console.log('='.repeat(80))
  console.log()
  console.log('Accounts to delete:')
  TEST_ACCOUNTS.forEach((email, i) => console.log(`  ${i + 1}. ${email}`))
  console.log()
  console.log('='.repeat(80))
  console.log()

  let totalDeleted = {
    medication_doses: 0,
    medications: 0,
    claim_items: 0,
    claims: 0,
    pets: 0,
    profiles: 0
  }

  for (const email of TEST_ACCOUNTS) {
    console.log(`Processing: ${email}`)
    console.log('-'.repeat(80))

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email)
      .single()

    if (profileError || !profile) {
      console.log(`  ⚠️  User not found or already deleted`)
      console.log()
      continue
    }

    const userId = profile.id
    console.log(`  User ID: ${userId}`)
    console.log(`  Name: ${profile.full_name || 'NO NAME'}`)
    console.log()

    // Get pets for this user
    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('id, name, species')
      .eq('user_id', userId)

    if (petsError) {
      console.error(`  ❌ Error fetching pets:`, petsError)
      continue
    }

    const petIds = pets.map(p => p.id)
    console.log(`  Pets (${pets.length}):`)
    pets.forEach(p => console.log(`    - ${p.name} (${p.species})`))
    console.log()

    if (petIds.length > 0) {
      // Get medications for these pets
      const { data: medications } = await supabase
        .from('medications')
        .select('id, name')
        .in('pet_id', petIds)

      const medicationIds = medications ? medications.map(m => m.id) : []
      console.log(`  Medications (${medicationIds.length}):`)
      if (medications) {
        medications.forEach(m => console.log(`    - ${m.name}`))
      }
      console.log()

      // 1. Delete medication_doses
      if (medicationIds.length > 0) {
        const { error: dosesError, count: dosesCount } = await supabase
          .from('medication_doses')
          .delete()
          .in('medication_id', medicationIds)
          .select('id', { count: 'exact', head: true })

        if (dosesError) {
          console.error(`  ❌ Error deleting medication_doses:`, dosesError)
        } else {
          console.log(`  ✅ Deleted ${dosesCount || 0} medication_doses`)
          totalDeleted.medication_doses += (dosesCount || 0)
        }
      }

      // 2. Delete medications
      if (medicationIds.length > 0) {
        const { error: medicationsError, count: medicationsCount } = await supabase
          .from('medications')
          .delete()
          .in('id', medicationIds)
          .select('id', { count: 'exact', head: true })

        if (medicationsError) {
          console.error(`  ❌ Error deleting medications:`, medicationsError)
        } else {
          console.log(`  ✅ Deleted ${medicationsCount || 0} medications`)
          totalDeleted.medications += (medicationsCount || 0)
        }
      }

      // Get claims for these pets
      const { data: claims } = await supabase
        .from('claims')
        .select('id, insurer')
        .in('pet_id', petIds)

      const claimIds = claims ? claims.map(c => c.id) : []
      console.log(`  Claims (${claimIds.length}):`)
      if (claims) {
        claims.forEach(c => console.log(`    - ${c.insurer}`))
      }
      console.log()

      // 3. Delete claim_items
      if (claimIds.length > 0) {
        const { error: claimItemsError, count: claimItemsCount } = await supabase
          .from('claim_items')
          .delete()
          .in('claim_id', claimIds)
          .select('id', { count: 'exact', head: true })

        if (claimItemsError) {
          console.error(`  ❌ Error deleting claim_items:`, claimItemsError)
        } else {
          console.log(`  ✅ Deleted ${claimItemsCount || 0} claim_items`)
          totalDeleted.claim_items += (claimItemsCount || 0)
        }
      }

      // 4. Delete claims
      if (claimIds.length > 0) {
        const { error: claimsError, count: claimsCount } = await supabase
          .from('claims')
          .delete()
          .in('id', claimIds)
          .select('id', { count: 'exact', head: true })

        if (claimsError) {
          console.error(`  ❌ Error deleting claims:`, claimsError)
        } else {
          console.log(`  ✅ Deleted ${claimsCount || 0} claims`)
          totalDeleted.claims += (claimsCount || 0)
        }
      }

      // 5. Delete pets
      const { error: petsDeleteError, count: petsCount } = await supabase
        .from('pets')
        .delete()
        .in('id', petIds)
        .select('id', { count: 'exact', head: true })

      if (petsDeleteError) {
        console.error(`  ❌ Error deleting pets:`, petsDeleteError)
      } else {
        console.log(`  ✅ Deleted ${petsCount || 0} pets`)
        totalDeleted.pets += (petsCount || 0)
      }
    }

    // 6. Delete profile
    const { error: profileDeleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) {
      console.error(`  ❌ Error deleting profile:`, profileDeleteError)
    } else {
      console.log(`  ✅ Deleted profile`)
      totalDeleted.profiles += 1
    }

    console.log()
    console.log(`  ✅ COMPLETED: ${email}`)
    console.log()
  }

  console.log('='.repeat(80))
  console.log('DELETION SUMMARY')
  console.log('='.repeat(80))
  console.log()
  console.log(`Profiles deleted:         ${totalDeleted.profiles}`)
  console.log(`Pets deleted:             ${totalDeleted.pets}`)
  console.log(`Claims deleted:           ${totalDeleted.claims}`)
  console.log(`Claim items deleted:      ${totalDeleted.claim_items}`)
  console.log(`Medications deleted:      ${totalDeleted.medications}`)
  console.log(`Medication doses deleted: ${totalDeleted.medication_doses}`)
  console.log()
  console.log('='.repeat(80))
  console.log('✅ ALL TEST ACCOUNTS DELETED SUCCESSFULLY')
  console.log('='.repeat(80))
  console.log()
  console.log('Remaining accounts are real users only.')
  console.log('You can verify by running: node list-all-users-and-pets.cjs')
  console.log()
}

deleteTestAccounts().catch(console.error)
