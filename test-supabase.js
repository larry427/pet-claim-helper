import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('Testing Supabase connection...')
console.log('URL:', supabaseUrl)
console.log('Anon Key present:', Boolean(supabaseAnonKey))
console.log('Anon Key length:', supabaseAnonKey?.length)
console.log('Service Key present:', Boolean(supabaseServiceKey))
console.log('Service Key length:', supabaseServiceKey?.length)

// Test with anon key (what frontend uses)
const anonClient = createClient(supabaseUrl, supabaseAnonKey)

console.log('\nTesting anon client...')
const testUserId = 'b7486f8d-c69f-4069-acfd-a6cb22bdd664'

try {
  const { data, error } = await anonClient
    .from('pets')
    .select('id, name')
    .eq('user_id', testUserId)
    .limit(5)

  console.log('Query result:', { data, error })
} catch (err) {
  console.error('Exception:', err)
}
