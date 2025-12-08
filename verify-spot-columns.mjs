#!/usr/bin/env node
/**
 * Verify spot_account_number and gender columns exist in pets table
 * If not, run the migrations
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verifyAndMigrate() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 VERIFYING SPOT INTEGRATION DATABASE COLUMNS')
  console.log('='.repeat(80) + '\n')

  try {
    // Check if spot_account_number column exists
    console.log('1. Checking for spot_account_number column...')
    const { data: spotColumnCheck, error: spotError } = await supabase
      .from('pets')
      .select('spot_account_number')
      .limit(1)

    if (spotError) {
      if (spotError.message.includes('column') || spotError.code === '42703') {
        console.log('   ❌ spot_account_number column DOES NOT EXIST')
        console.log('   📝 Running migration: ALTER TABLE pets ADD COLUMN spot_account_number TEXT')

        const { error: migrationError } = await supabase.rpc('exec_sql', {
          sql: 'ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT'
        })

        if (migrationError) {
          console.log('   ⚠️  Migration failed (may need to run manually):')
          console.log('   SQL: ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT;')
        } else {
          console.log('   ✅ spot_account_number column created successfully!')
        }
      } else {
        console.log('   ⚠️  Unexpected error:', spotError.message)
      }
    } else {
      console.log('   ✅ spot_account_number column EXISTS')
    }

    // Check if gender column exists
    console.log('\n2. Checking for gender column...')
    const { data: genderColumnCheck, error: genderError } = await supabase
      .from('pets')
      .select('gender')
      .limit(1)

    if (genderError) {
      if (genderError.message.includes('column') || genderError.code === '42703') {
        console.log('   ❌ gender column DOES NOT EXIST')
        console.log('   📝 Running migration: ALTER TABLE pets ADD COLUMN gender TEXT')

        const { error: migrationError } = await supabase.rpc('exec_sql', {
          sql: 'ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT'
        })

        if (migrationError) {
          console.log('   ⚠️  Migration failed (may need to run manually):')
          console.log('   SQL: ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT;')
        } else {
          console.log('   ✅ gender column created successfully!')
        }
      } else {
        console.log('   ⚠️  Unexpected error:', genderError.message)
      }
    } else {
      console.log('   ✅ gender column EXISTS')
    }

    // Final verification - fetch all columns
    console.log('\n3. Verifying all required columns exist...')
    const { data: testPet, error: testError } = await supabase
      .from('pets')
      .select('name, species, breed, date_of_birth, gender, policy_number, healthy_paws_pet_id, pumpkin_account_number, spot_account_number')
      .limit(1)

    if (testError) {
      console.log('   ❌ Verification failed:', testError.message)
      console.log('\n⚠️  MANUAL MIGRATION REQUIRED:')
      console.log('   Run these SQL commands in Supabase SQL Editor:')
      console.log('   ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT;')
      console.log('   ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT;')
    } else {
      console.log('   ✅ All required columns verified!')
      console.log('\n📊 Sample pet record structure:')
      if (testPet && testPet.length > 0) {
        console.log('   Columns available:', Object.keys(testPet[0]).join(', '))
      } else {
        console.log('   (No pets in database yet)')
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ VERIFICATION COMPLETE')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ UNEXPECTED ERROR:', error)
    console.log('\n⚠️  MANUAL MIGRATION REQUIRED:')
    console.log('   Run these SQL commands in Supabase SQL Editor:')
    console.log('   ALTER TABLE pets ADD COLUMN IF NOT EXISTS spot_account_number TEXT;')
    console.log('   ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT;')
  }
}

verifyAndMigrate()
