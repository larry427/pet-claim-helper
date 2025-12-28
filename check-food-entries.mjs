import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ogoqpglqevfwngfynyzu.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nb3FwZ2xxZXZmd25nZnlueXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDY0MjUzMywiZXhwIjoyMDUwMjE4NTMzfQ.m8v-vw-94u5bTN7VLqTvmPlQ5YsN0lHJa_YMOCGe0BM'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkFoodEntries() {
  // First get all profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')

  if (profileError) {
    console.error('Profile Error:', profileError)
    return
  }

  // Filter non-Larry profiles
  const nonLarryProfiles = profiles.filter(p =>
    !p.email.toLowerCase().includes('larry') &&
    !p.email.toLowerCase().includes('uglydogadventures') &&
    !p.email.toLowerCase().includes('dogstrainedright')
  )

  console.log(`\nFound ${nonLarryProfiles.length} non-Larry profiles`)

  if (nonLarryProfiles.length === 0) {
    console.log('No non-Larry profiles found.')
    return
  }

  // Get food entries for non-Larry users
  const nonLarryUserIds = nonLarryProfiles.map(p => p.id)

  const { data: foodEntries, error: foodError } = await supabase
    .from('food_entries')
    .select('*')
    .in('user_id', nonLarryUserIds)
    .order('created_at', { ascending: false })

  if (foodError) {
    console.error('Food Error:', foodError)
    return
  }

  console.log('\nNon-Larry Food Entries:')
  console.log('='.repeat(60))

  if (foodEntries.length === 0) {
    console.log('No food entries from non-Larry accounts yet.')
    console.log('\nNon-Larry users:', nonLarryProfiles.map(p => p.email).join(', '))
  } else {
    foodEntries.forEach(entry => {
      const profile = profiles.find(p => p.id === entry.user_id)
      console.log(`Email: ${profile?.email || 'Unknown'}`)
      console.log(`Food: ${entry.food_name}`)
      console.log(`Created: ${new Date(entry.created_at).toLocaleString()}`)
      console.log('-'.repeat(60))
    })
    console.log(`\nTotal: ${foodEntries.length} entries`)
  }
}

checkFoodEntries()
