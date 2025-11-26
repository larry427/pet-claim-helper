require('dotenv').config({ path: 'server/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function realBetaStats() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 REAL BETA TESTER STATS (Excluding Larry\'s Test Accounts)')
  console.log('='.repeat(80))

  // Excluded emails
  const excludedEmails = ['larry@uglydogadventures.com', 'larrysecrets@gmail.com']

  // 1. Get all real beta testers
  console.log('\n1️⃣ REAL BETA TESTERS')
  console.log('─'.repeat(80))

  const { data: allUsers } = await supabase
    .from('profiles')
    .select('*')
    .not('email', 'ilike', '%larry%')
    .order('created_at', { ascending: false })

  console.log(`\nTotal real beta testers: ${allUsers?.length || 0}\n`)

  if (allUsers && allUsers.length > 0) {
    console.log('┌─────────────────────────────────────┬──────────────────────┐')
    console.log('│ Email                               │ Signup Date          │')
    console.log('├─────────────────────────────────────┼──────────────────────┤')
    allUsers.forEach(user => {
      const email = (user.email || 'No email').padEnd(35)
      const date = new Date(user.created_at).toLocaleDateString()
      console.log(`│ ${email} │ ${date.padEnd(20)} │`)
    })
    console.log('└─────────────────────────────────────┴──────────────────────┘')
  }

  // 2. Activity by user
  console.log('\n2️⃣ ACTIVITY BY REAL BETA TESTER')
  console.log('─'.repeat(80))

  const activityMap = {}

  // Get pets
  const { data: pets } = await supabase
    .from('pets')
    .select('user_id, name, insurance_company, profiles!inner(email)')
    .not('profiles.email', 'ilike', '%larry%')

  // Get claims
  const { data: claims } = await supabase
    .from('claims')
    .select('user_id, id, created_at, total_amount, status, profiles!inner(email)')
    .not('profiles.email', 'ilike', '%larry%')

  // Get medications
  const { data: medications } = await supabase
    .from('medications')
    .select('user_id, medication_name, profiles!inner(email)')
    .not('profiles.email', 'ilike', '%larry%')

  // Build activity map
  allUsers?.forEach(user => {
    activityMap[user.id] = {
      email: user.email,
      pets: 0,
      claims: 0,
      medications: 0,
      lastActivity: user.created_at
    }
  })

  pets?.forEach(pet => {
    if (activityMap[pet.user_id]) {
      activityMap[pet.user_id].pets++
    }
  })

  claims?.forEach(claim => {
    if (activityMap[claim.user_id]) {
      activityMap[claim.user_id].claims++
      if (new Date(claim.created_at) > new Date(activityMap[claim.user_id].lastActivity)) {
        activityMap[claim.user_id].lastActivity = claim.created_at
      }
    }
  })

  medications?.forEach(med => {
    if (activityMap[med.user_id]) {
      activityMap[med.user_id].medications++
    }
  })

  const sortedUsers = Object.values(activityMap).sort((a, b) => {
    const aTotal = a.pets + a.claims + a.medications
    const bTotal = b.pets + b.claims + b.medications
    return bTotal - aTotal
  })

  console.log('\n┌─────────────────────────────────────┬──────┬────────┬──────────────┬──────────────────┐')
  console.log('│ Email                               │ Pets │ Claims │ Medications  │ Last Activity    │')
  console.log('├─────────────────────────────────────┼──────┼────────┼──────────────┼──────────────────┤')

  sortedUsers.forEach(user => {
    const email = (user.email || 'No email').padEnd(35)
    const petsStr = String(user.pets).padStart(4)
    const claimsStr = String(user.claims).padStart(6)
    const medsStr = String(user.medications).padStart(12)
    const lastActivity = new Date(user.lastActivity).toLocaleDateString().padEnd(16)
    console.log(`│ ${email} │ ${petsStr} │ ${claimsStr} │ ${medsStr} │ ${lastActivity} │`)
  })
  console.log('└─────────────────────────────────────┴──────┴────────┴──────────────┴──────────────────┘')

  // Show active vs inactive
  const activeUsers = sortedUsers.filter(u => u.pets > 0 || u.claims > 0 || u.medications > 0)
  const inactiveUsers = sortedUsers.filter(u => u.pets === 0 && u.claims === 0 && u.medications === 0)

  console.log(`\nActive users: ${activeUsers.length}`)
  console.log(`Inactive users: ${inactiveUsers.length}`)

  // 3. Claims by insurance company (real users only)
  console.log('\n3️⃣ CLAIMS BY INSURANCE COMPANY (Real Users Only)')
  console.log('─'.repeat(80))

  const { data: claimsByInsurer } = await supabase
    .from('claims')
    .select(`
      id,
      pets (insurance_company),
      profiles!inner(email)
    `)
    .not('profiles.email', 'ilike', '%larry%')

  const insurerCounts = {}
  claimsByInsurer?.forEach(claim => {
    const insurer = claim.pets?.insurance_company || 'Unknown'
    insurerCounts[insurer] = (insurerCounts[insurer] || 0) + 1
  })

  const sortedInsurers = Object.entries(insurerCounts).sort((a, b) => b[1] - a[1])

  if (sortedInsurers.length > 0) {
    console.log('\n┌─────────────────────────────────────┬───────┐')
    console.log('│ Insurance Company                   │ Count │')
    console.log('├─────────────────────────────────────┼───────┤')
    sortedInsurers.forEach(([insurer, count]) => {
      const name = insurer.padEnd(35)
      const num = String(count).padStart(5)
      console.log(`│ ${name} │ ${num} │`)
    })
    console.log('└─────────────────────────────────────┴───────┘')
  } else {
    console.log('\n  No claims from real beta testers yet')
  }

  // 4. Recent claims (real users only, last 7 days)
  console.log('\n4️⃣ RECENT CLAIMS (Real Users, Last 7 Days)')
  console.log('─'.repeat(80))

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: recentClaims } = await supabase
    .from('claims')
    .select(`
      id,
      created_at,
      status,
      total_amount,
      pets (name, insurance_company),
      profiles!inner(email)
    `)
    .not('profiles.email', 'ilike', '%larry%')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (recentClaims && recentClaims.length > 0) {
    console.log(`\nFound ${recentClaims.length} claims in the last 7 days:\n`)
    recentClaims.forEach(claim => {
      const date = new Date(claim.created_at).toLocaleString()
      const petName = claim.pets?.name || 'Unknown'
      const insurer = claim.pets?.insurance_company || 'Unknown'
      const amount = claim.total_amount ? `$${claim.total_amount}` : 'N/A'
      const email = claim.profiles?.email || 'Unknown'
      console.log(`  ${date}`)
      console.log(`    Pet: ${petName} | Insurer: ${insurer}`)
      console.log(`    Amount: ${amount} | Status: ${claim.status}`)
      console.log(`    User: ${email}`)
      console.log('')
    })
  } else {
    console.log('\n  No claims from real users in the last 7 days')
  }

  // 5. Summary stats
  console.log('\n5️⃣ OVERALL SUMMARY (Real Users Only)')
  console.log('─'.repeat(80))

  const totalPets = pets?.length || 0
  const totalClaims = claims?.length || 0
  const totalMedications = medications?.length || 0
  const totalUsers = allUsers?.length || 0

  console.log(`\nTotal Beta Testers:  ${totalUsers}`)
  console.log(`Active Beta Testers: ${activeUsers.length} (${totalUsers > 0 ? Math.round(activeUsers.length / totalUsers * 100) : 0}%)`)
  console.log(`Inactive:            ${inactiveUsers.length}`)
  console.log(``)
  console.log(`Total Pets:          ${totalPets}`)
  console.log(`Total Claims:        ${totalClaims}`)
  console.log(`Total Medications:   ${totalMedications}`)

  if (activeUsers.length > 0) {
    console.log(``)
    console.log(`Avg Pets/Active User:   ${(totalPets / activeUsers.length).toFixed(1)}`)
    console.log(`Avg Claims/Active User: ${(totalClaims / activeUsers.length).toFixed(1)}`)
    console.log(`Avg Meds/Active User:   ${(totalMedications / activeUsers.length).toFixed(1)}`)
  }

  console.log('\n' + '='.repeat(80) + '\n')
}

realBetaStats().catch(console.error)
