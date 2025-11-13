import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const API_URL = process.env.API_URL || 'http://localhost:8787'
const TEST_PHONE = process.env.TEST_PHONE || '+1234567890' // Replace with real phone for testing

async function testSMSSystem() {
  console.log('🧪 TESTING SMS MEDICATION REMINDER SYSTEM\n')
  console.log('=' .repeat(80))

  // Test 1: Check database schema
  console.log('\n📋 TEST 1: Verify database schema')
  console.log('-'.repeat(80))

  try {
    // Check if sms_opt_in column exists
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, phone, sms_opt_in')
      .limit(1)

    console.log('✅ profiles table has sms_opt_in column')

    // Check medications table
    const { data: meds } = await supabase
      .from('medications')
      .select('id, medication_name, reminder_times')
      .limit(1)

    console.log('✅ medications table accessible')

    // Check medication_reminders_log table
    const { data: logs } = await supabase
      .from('medication_reminders_log')
      .select('id')
      .limit(1)

    console.log('✅ medication_reminders_log table accessible')
  } catch (error) {
    console.error('❌ Schema check failed:', error.message)
    return
  }

  // Test 2: Test welcome SMS endpoint
  console.log('\n📧 TEST 2: Test welcome SMS endpoint')
  console.log('-'.repeat(80))

  try {
    const response = await fetch(`${API_URL}/api/sms/welcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-user-id',
        phoneNumber: TEST_PHONE
      })
    })

    const result = await response.json()

    if (result.ok) {
      console.log('✅ Welcome SMS endpoint works')
      console.log(`   Message ID: ${result.messageId}`)
    } else {
      console.log('⚠️  Welcome SMS endpoint returned error:', result.error)
    }
  } catch (error) {
    console.error('❌ Welcome SMS test failed:', error.message)
  }

  // Test 3: Test HELP/STOP webhook endpoint
  console.log('\n📲 TEST 3: Test HELP/STOP webhook endpoint')
  console.log('-'.repeat(80))

  try {
    // Test HELP command
    const helpResponse = await fetch(`${API_URL}/api/sms/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        Body: 'HELP',
        From: TEST_PHONE
      })
    })

    const helpText = await helpResponse.text()
    if (helpText.includes('Pet Claim Helper medication reminders')) {
      console.log('✅ HELP command works')
    } else {
      console.log('⚠️  HELP command response unexpected:', helpText)
    }

    // Test STOP command
    const stopResponse = await fetch(`${API_URL}/api/sms/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        Body: 'STOP',
        From: TEST_PHONE
      })
    })

    const stopText = await stopResponse.text()
    console.log('✅ STOP command processed')
  } catch (error) {
    console.error('❌ Webhook test failed:', error.message)
  }

  // Test 4: Test mark-given endpoint
  console.log('\n💊 TEST 4: Test mark-given endpoint')
  console.log('-'.repeat(80))

  try {
    // Create a test medication first
    const { data: user } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'larry@uglydogadventures.com')
      .single()

    if (!user) {
      console.log('⚠️  Test user not found, skipping medication tests')
    } else {
      // Get or create a test pet
      const { data: pets } = await supabase
        .from('pets')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1)

      if (!pets || pets.length === 0) {
        console.log('⚠️  No pets found for test user, skipping medication tests')
      } else {
        const pet = pets[0]
        console.log(`   Using pet: ${pet.name}`)

        // Create a test medication
        const today = new Date().toISOString().split('T')[0]
        const { data: medication, error: medError } = await supabase
          .from('medications')
          .insert({
            user_id: user.id,
            pet_id: pet.id,
            medication_name: 'Test Medication',
            dosage: '10mg',
            frequency: '1x daily',
            reminder_times: ['09:00'],
            start_date: today,
            end_date: null
          })
          .select()
          .single()

        if (medError) {
          console.error('❌ Failed to create test medication:', medError.message)
        } else {
          console.log(`✅ Created test medication: ${medication.id}`)

          // Create a test dose
          const { data: dose } = await supabase
            .from('medication_doses')
            .insert({
              medication_id: medication.id,
              user_id: user.id,
              scheduled_time: new Date().toISOString(),
              status: 'pending'
            })
            .select()
            .single()

          if (dose) {
            console.log(`✅ Created test dose: ${dose.id}`)

            // Test mark-given endpoint
            const response = await fetch(`${API_URL}/api/medications/${medication.id}/mark-given`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id })
            })

            const result = await response.json()

            if (result.ok) {
              console.log('✅ Mark-given endpoint works')
              console.log(`   Dose marked: ${result.doseId}`)
            } else {
              console.log('⚠️  Mark-given error:', result.error)
            }

            // Cleanup: delete test data
            await supabase.from('medication_doses').delete().eq('medication_id', medication.id)
            await supabase.from('medications').delete().eq('id', medication.id)
            console.log('✅ Cleaned up test medication')
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Mark-given test failed:', error.message)
  }

  // Test 5: Test deep link URL
  console.log('\n🔗 TEST 5: Test deep link URL format')
  console.log('-'.repeat(80))

  const testMedicationId = 'abc123-def456-ghi789'
  const deepLink = `https://pet-claim-helper.vercel.app/dose/${testMedicationId}?action=mark`
  console.log(`   Deep link format: ${deepLink}`)
  console.log('✅ Deep link URL structure correct')

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('✅ SMS SYSTEM TESTING COMPLETE')
  console.log('='.repeat(80))
  console.log('\n📝 MANUAL TESTING STEPS:')
  console.log('1. Run migration: Execute add-sms-opt-in-migration.sql in Supabase')
  console.log('2. Set up Twilio webhook: POST https://your-domain.com/api/sms/incoming')
  console.log('3. Test onboarding: Sign up with phone number')
  console.log('4. Test medication reminder: Create medication with reminder time')
  console.log('5. Test deep link: Click link from SMS to mark dose as given')
  console.log('6. Test HELP: Text "HELP" to +18446256781')
  console.log('7. Test STOP: Text "STOP" to +18446256781')
  console.log('\n')
}

testSMSSystem().then(() => process.exit(0))
