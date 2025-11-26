require('dotenv').config({ path: 'server/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function analyzeBetaUsage() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 BETA TESTER ACTIVITY & USAGE STATISTICS')
  console.log('='.repeat(80))

  // 1. TOTAL USERS
  console.log('\n1️⃣ TOTAL USERS')
  const { data: allUsers, count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })

  console.log(`Total registered users: ${totalUsers}`)

  // 2. ACTIVE USERS (with actual data)
  console.log('\n2️⃣ ACTIVE USERS (users who have added data)')

  const { data: usersWithPets } = await supabase
    .from('pets')
    .select('user_id')

  const { data: usersWithClaims } = await supabase
    .from('claims')
    .select('user_id')

  const { data: usersWithMedications } = await supabase
    .from('medications')
    .select('user_id')

  const uniquePetUsers = new Set(usersWithPets?.map(p => p.user_id) || [])
  const uniqueClaimUsers = new Set(usersWithClaims?.map(c => c.user_id) || [])
  const uniqueMedicationUsers = new Set(usersWithMedications?.map(m => m.user_id) || [])

  console.log(`  Users with pets: ${uniquePetUsers.size}`)
  console.log(`  Users with claims/bills: ${uniqueClaimUsers.size}`)
  console.log(`  Users with medications: ${uniqueMedicationUsers.size}`)

  const allActiveUsers = new Set([
    ...uniquePetUsers,
    ...uniqueClaimUsers,
    ...uniqueMedicationUsers
  ])
  console.log(`  Total active users (added ANY data): ${allActiveUsers.size}`)
  console.log(`  Inactive users (sign-up only): ${totalUsers - allActiveUsers.size}`)

  // 3. RECENT ACTIVITY (last 3 days)
  console.log('\n3️⃣ RECENT SIGNUPS (last 3 days)')
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const { data: recentUsers } = await supabase
    .from('profiles')
    .select('email, created_at, full_name')
    .gte('created_at', threeDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (recentUsers && recentUsers.length > 0) {
    console.log(`Found ${recentUsers.length} new signups:`)
    recentUsers.forEach(user => {
      const date = new Date(user.created_at).toLocaleString()
      console.log(`  ${date} - ${user.email} (${user.full_name || 'No name'})`)
    })
  } else {
    console.log('  No new signups in the last 3 days')
  }

  // 4. MOST ACTIVE USERS
  console.log('\n4️⃣ MOST ACTIVE USERS (ranked by activity)')

  // Get all pets
  const { data: allPets } = await supabase
    .from('pets')
    .select('user_id, name')

  // Get all claims
  const { data: allClaims } = await supabase
    .from('claims')
    .select('user_id, id')

  // Get all medications
  const { data: allMedications } = await supabase
    .from('medications')
    .select('user_id, medication_name')

  // Build activity map
  const activityMap = {}

  allUsers?.forEach(user => {
    activityMap[user.id] = {
      email: user.email,
      fullName: user.full_name,
      pets: 0,
      claims: 0,
      medications: 0,
      createdAt: user.created_at
    }
  })

  allPets?.forEach(pet => {
    if (activityMap[pet.user_id]) {
      activityMap[pet.user_id].pets++
    }
  })

  allClaims?.forEach(claim => {
    if (activityMap[claim.user_id]) {
      activityMap[claim.user_id].claims++
    }
  })

  allMedications?.forEach(med => {
    if (activityMap[med.user_id]) {
      activityMap[med.user_id].medications++
    }
  })

  // Sort by total activity
  const sortedUsers = Object.values(activityMap).sort((a, b) => {
    const aTotal = a.pets + a.claims + a.medications
    const bTotal = b.pets + b.claims + b.medications
    return bTotal - aTotal
  })

  console.log('\n┌─────────────────────────────────────────────────────────────────────┬──────┬────────┬──────────────┐')
  console.log('│ User Email                                                          │ Pets │ Claims │ Medications  │')
  console.log('├─────────────────────────────────────────────────────────────────────┼──────┼────────┼──────────────┤')

  sortedUsers.forEach(user => {
    const total = user.pets + user.claims + user.medications
    if (total > 0) { // Only show active users
      const email = (user.email || 'No email').padEnd(67)
      const pets = String(user.pets).padStart(4)
      const claims = String(user.claims).padStart(6)
      const medications = String(user.medications).padStart(12)
      console.log(`│ ${email} │ ${pets} │ ${claims} │ ${medications} │`)
    }
  })

  console.log('└─────────────────────────────────────────────────────────────────────┴──────┴────────┴──────────────┘')

  // Show inactive users
  const inactiveUsers = sortedUsers.filter(user =>
    user.pets === 0 && user.claims === 0 && user.medications === 0
  )

  if (inactiveUsers.length > 0) {
    console.log('\n📋 INACTIVE USERS (sign-up only, no data added):')
    inactiveUsers.forEach(user => {
      const date = new Date(user.createdAt).toLocaleDateString()
      console.log(`  ${user.email} - Signed up: ${date}`)
    })
  }

  // 5. OVERALL STATISTICS
  console.log('\n5️⃣ OVERALL STATISTICS')
  console.log('='.repeat(80))

  const { count: totalPets } = await supabase
    .from('pets')
    .select('*', { count: 'exact', head: true })

  const { count: totalClaims } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true })

  const { count: totalMedications } = await supabase
    .from('medications')
    .select('*', { count: 'exact', head: true })

  console.log(`Total Users:        ${totalUsers}`)
  console.log(`Active Users:       ${allActiveUsers.size} (${Math.round(allActiveUsers.size / totalUsers * 100)}%)`)
  console.log(`Inactive Users:     ${totalUsers - allActiveUsers.size} (${Math.round((totalUsers - allActiveUsers.size) / totalUsers * 100)}%)`)
  console.log(``)
  console.log(`Total Pets:         ${totalPets}`)
  console.log(`Total Claims/Bills: ${totalClaims}`)
  console.log(`Total Medications:  ${totalMedications}`)
  console.log(``)
  console.log(`Avg Pets/User:      ${(totalPets / allActiveUsers.size).toFixed(1)}`)
  console.log(`Avg Claims/User:    ${(totalClaims / allActiveUsers.size).toFixed(1)}`)
  console.log(`Avg Meds/User:      ${(totalMedications / allActiveUsers.size).toFixed(1)}`)

  console.log('='.repeat(80) + '\n')
}

analyzeBetaUsage().catch(console.error)
