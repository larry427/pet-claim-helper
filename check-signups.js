import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSignups() {
  console.log('[Signup Check] Fetching recent signups...\n')

  // Query auth.users table
  const { data, error } = await supabase.auth.admin.listUsers({
    perPage: 20,
  })

  if (error) {
    console.error('[Signup Check] Error:', error)
    return
  }

  if (!data || !data.users || data.users.length === 0) {
    console.log('[Signup Check] No users found')
    return
  }

  // Sort by created_at desc
  const users = data.users.sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  )

  console.log(`[Signup Check] Found ${users.length} recent signups:\n`)
  console.log('ID'.padEnd(40) + 'Email'.padEnd(35) + 'Created'.padEnd(25) + 'Email Confirmed')
  console.log('-'.repeat(125))

  users.forEach(user => {
    const id = user.id.substring(0, 36)
    const email = (user.email || 'N/A').padEnd(35)
    const created = new Date(user.created_at).toISOString().substring(0, 19).replace('T', ' ')
    const confirmed = user.email_confirmed_at
      ? new Date(user.email_confirmed_at).toISOString().substring(0, 19).replace('T', ' ')
      : 'Not confirmed'

    console.log(id.padEnd(40) + email + created.padEnd(25) + confirmed)
  })

  console.log('\n[Signup Check] Done')
}

checkSignups().catch(console.error)
