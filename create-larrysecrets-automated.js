import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ORIGINAL_USER_ID = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664' // larry@uglydogadventures.com
const NEW_EMAIL = 'larrysecrets@gmail.com'

// Generate a secure random password
function generatePassword() {
  return crypto.randomBytes(16).toString('hex')
}

async function createLarrySecretsAccount() {
  console.log('='.repeat(80))
  console.log('CREATING SECOND LARRY ACCOUNT')
  console.log('='.repeat(80))
  console.log(`Source: larry@uglydogadventures.com (${ORIGINAL_USER_ID})`)
  console.log(`Target: ${NEW_EMAIL}`)
  console.log('')

  try {
    // ========================================================================
    // STEP 1: Create auth user
    // ========================================================================
    console.log('[STEP 1] Creating auth user...')
    const password = generatePassword()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: NEW_EMAIL,
      password: password,
      email_confirm: true,
      user_metadata: {}
    })

    if (authError) {
      console.error('❌ Error creating auth user:', authError)
      throw authError
    }

    if (!authData || !authData.user) {
      throw new Error('No user data returned from createUser')
    }

    const newUserId = authData.user.id
    console.log(`✅ Auth user created successfully`)
    console.log(`   User ID: ${newUserId}`)
    console.log(`   Email: ${NEW_EMAIL}`)
    console.log(`   Password: ${password}`)
    console.log(`   ⚠️  SAVE THIS PASSWORD - it won't be shown again!`)
    console.log('')

    // ========================================================================
    // STEP 2: Get original profile data
    // ========================================================================
    console.log('[STEP 2] Fetching original profile data...')

    const { data: originalProfile, error: profileFetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', ORIGINAL_USER_ID)
      .single()

    if (profileFetchError) {
      console.error('❌ Error fetching original profile:', profileFetchError)
      throw profileFetchError
    }

    console.log(`✅ Original profile fetched`)
    console.log('')

    // ========================================================================
    // STEP 3: Insert new profile
    // ========================================================================
    console.log('[STEP 3] Creating new profile...')

    const { error: profileInsertError } = await supabase
      .from('profiles')
      .insert({
        id: newUserId,
        email: NEW_EMAIL,
        full_name: originalProfile.full_name,
        phone: originalProfile.phone,
        address: originalProfile.address,
        email_reminders: originalProfile.email_reminders,
        weekly_summaries: originalProfile.weekly_summaries,
        deadline_alerts: originalProfile.deadline_alerts,
        default_expense_category: originalProfile.default_expense_category,
        default_time_period: originalProfile.default_time_period,
        insurance_company: originalProfile.insurance_company,
        filing_deadline_days: originalProfile.filing_deadline_days,
        phone_number: originalProfile.phone_number,
        timezone: originalProfile.timezone,
        sms_opt_in: originalProfile.sms_opt_in,
        signature: originalProfile.signature,
        policy_number: originalProfile.policy_number,
        is_admin: false,
        onboarding_complete: originalProfile.onboarding_complete,
        city: originalProfile.city,
        state: originalProfile.state,
        zip: originalProfile.zip,
        is_demo_account: false  // LIVE MODE - not a demo account!
      })

    if (profileInsertError) {
      console.error('❌ Error creating profile:', profileInsertError)
      throw profileInsertError
    }

    console.log(`✅ Profile created successfully`)
    console.log(`   is_demo_account: false (LIVE MODE)`)
    console.log('')

    // ========================================================================
    // STEP 4: Get original pets
    // ========================================================================
    console.log('[STEP 4] Fetching original pets...')

    const { data: originalPets, error: petsFetchError } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', ORIGINAL_USER_ID)
      .order('created_at')

    if (petsFetchError) {
      console.error('❌ Error fetching pets:', petsFetchError)
      throw petsFetchError
    }

    console.log(`✅ Found ${originalPets.length} pets to copy`)
    console.log('')

    // ========================================================================
    // STEP 5: Copy pets
    // ========================================================================
    console.log('[STEP 5] Copying pets...')

    const petIdMapping = {} // Map old pet ID -> new pet ID

    for (const pet of originalPets) {
      const newPetData = {
        user_id: newUserId,
        name: pet.name,
        species: pet.species,
        color: pet.color,
        photo_url: pet.photo_url,
        insurance_company: pet.insurance_company,
        policy_number: pet.policy_number,
        owner_name: pet.owner_name,
        owner_address: pet.owner_address,
        owner_phone: pet.owner_phone,
        filing_deadline_days: pet.filing_deadline_days
      }

      const { data: newPet, error: petInsertError } = await supabase
        .from('pets')
        .insert(newPetData)
        .select()
        .single()

      if (petInsertError) {
        console.error(`❌ Error copying pet "${pet.name}":`, petInsertError)
        throw petInsertError
      }

      petIdMapping[pet.id] = newPet.id
      console.log(`   ✅ Copied pet: ${pet.name} (${pet.species})`)
      console.log(`      Old ID: ${pet.id}`)
      console.log(`      New ID: ${newPet.id}`)
    }

    console.log(`✅ All ${originalPets.length} pets copied successfully`)
    console.log('')

    // ========================================================================
    // STEP 6: Note about insurance policies
    // ========================================================================
    console.log('[STEP 6] Checking for insurance policies...')
    console.log('   ℹ️  Note: The schema shows insurance info is stored IN the pets table')
    console.log('   ℹ️  (insurance_company and policy_number fields)')
    console.log('   ℹ️  There is no separate "insurance_policies" table in this schema')
    console.log('   ✅ Insurance data already copied with pets')
    console.log('')

    // ========================================================================
    // FINAL VERIFICATION
    // ========================================================================
    console.log('[VERIFICATION] Checking created account...')

    const { data: newProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', newUserId)
      .single()

    if (verifyError) {
      console.error('❌ Error verifying profile:', verifyError)
    } else {
      console.log(`✅ Profile verified: ${newProfile.email}`)
    }

    const { data: newPets, error: petsVerifyError } = await supabase
      .from('pets')
      .select('id, name')
      .eq('user_id', newUserId)

    if (petsVerifyError) {
      console.error('❌ Error verifying pets:', petsVerifyError)
    } else {
      console.log(`✅ Pets verified: ${newPets.length} pets`)
      newPets.forEach(p => console.log(`     - ${p.name}`))
    }

    console.log('')
    console.log('='.repeat(80))
    console.log('✅ ACCOUNT CREATION COMPLETE!')
    console.log('='.repeat(80))
    console.log('')
    console.log('CREDENTIALS:')
    console.log(`Email: ${NEW_EMAIL}`)
    console.log(`Password: ${password}`)
    console.log(`User ID: ${newUserId}`)
    console.log('')
    console.log('⚠️  IMPORTANT: Save these credentials! The password cannot be retrieved later.')
    console.log('')

  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('❌ FATAL ERROR')
    console.error('='.repeat(80))
    console.error(error)
    process.exit(1)
  }
}

createLarrySecretsAccount().catch(console.error)
