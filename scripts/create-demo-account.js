#!/usr/bin/env node
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local from project root
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createDemoAccount(prospectEmail, prospectName, petName = 'Max') {
  console.log(`\n🐾 Creating demo account for: ${prospectEmail}\n`)

  try {
    // 1. Create user with email already confirmed (no verification email)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: prospectEmail,
      password: 'Demo123!',
      email_confirm: true
    })

    if (userError) {
      console.error('❌ Error creating user:', userError.message)
      process.exit(1)
    }

    const userId = userData.user.id
    console.log('✅ User created:', userId)

    // 2. Create profile with is_demo_account = true
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email: prospectEmail,
      full_name: prospectName,
      phone: '(555) 123-4567',
      address: '123 Demo Street',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90210',
      is_demo_account: true,
      onboarding_complete: true
    })

    if (profileError) {
      console.error('❌ Error creating profile:', profileError.message)
      process.exit(1)
    }
    console.log('✅ Profile created with is_demo_account = true')

    // 3. Create demo pet with Pumpkin insurance
    const { data: petData, error: petError } = await supabase.from('pets').insert({
      user_id: userId,
      name: petName,
      species: 'dog',
      breed: 'Golden Retriever',
      insurance_company: 'Pumpkin',
      pumpkin_account_number: 'DEMO-12345'
    }).select().single()

    if (petError) {
      console.error('❌ Error creating pet:', petError.message)
      process.exit(1)
    }
    console.log(`✅ Pet created: ${petName} (Pumpkin insurance)`)

    // 4. Print summary
    console.log('\n' + '='.repeat(50))
    console.log('🎉 DEMO ACCOUNT READY!')
    console.log('='.repeat(50))
    console.log(`Email:    ${prospectEmail}`)
    console.log(`Password: Demo123!`)
    console.log(`Pet:      ${petName} (Dog, Pumpkin)`)
    console.log('='.repeat(50))
    console.log('\nDuring demo:')
    console.log('• Claims route TO larry@uglydogadventures.com (safe)')
    console.log(`• BCC goes to ${prospectEmail} (prospect sees it live!)`)
    console.log('='.repeat(50) + '\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
    process.exit(1)
  }
}

// Parse command line args
const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node scripts/create-demo-account.js <email> <name> [petName]')
  console.log('Example: node scripts/create-demo-account.js john@acme.com "John Smith" "Buddy"')
  process.exit(1)
}

createDemoAccount(args[0], args[1], args[2])
