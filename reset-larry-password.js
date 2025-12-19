import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function resetPassword() {
  console.log('Resetting password for larry@uglydogadventures.com...\n')

  const { data, error } = await supabase.auth.admin.updateUserById(
    'b7486f8d-c69f-4069-acfd-a6cb22bdd664',
    { password: '123456' }
  )

  if (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  console.log('✅ Password reset successfully!')
  console.log('\nLogin credentials:')
  console.log('Email: larry@uglydogadventures.com')
  console.log('Password: 123456')
}

resetPassword().catch(console.error)
