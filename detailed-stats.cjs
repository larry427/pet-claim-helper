require('dotenv').config({ path: 'server/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function detailedStats() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 DETAILED PRODUCTION STATISTICS')
  console.log('='.repeat(80))

  // 1. Claims by Insurer
  console.log('\n1️⃣ CLAIMS BY INSURANCE COMPANY')
  console.log('─'.repeat(80))

  const { data: claimsByInsurer } = await supabase
    .from('claims')
    .select(`
      id,
      pets (insurance_company)
    `)

  const insurerCounts = {}
  claimsByInsurer?.forEach(claim => {
    const insurer = claim.pets?.insurance_company || 'Unknown'
    insurerCounts[insurer] = (insurerCounts[insurer] || 0) + 1
  })

  const sortedInsurers = Object.entries(insurerCounts)
    .sort((a, b) => b[1] - a[1])

  console.log('\n┌─────────────────────────────────────┬───────┐')
  console.log('│ Insurance Company                   │ Count │')
  console.log('├─────────────────────────────────────┼───────┤')
  sortedInsurers.forEach(([insurer, count]) => {
    const name = insurer.padEnd(35)
    const num = String(count).padStart(5)
    console.log(`│ ${name} │ ${num} │`)
  })
  console.log('└─────────────────────────────────────┴───────┘')

  // 2. Claims by Status
  console.log('\n2️⃣ CLAIMS BY STATUS')
  console.log('─'.repeat(80))

  const { data: claimsByStatus } = await supabase
    .from('claims')
    .select('status')

  const statusCounts = {}
  claimsByStatus?.forEach(claim => {
    const status = claim.status || 'Unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
  })

  const sortedStatuses = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])

  console.log('\n┌─────────────────────────────────────┬───────┐')
  console.log('│ Status                              │ Count │')
  console.log('├─────────────────────────────────────┼───────┤')
  sortedStatuses.forEach(([status, count]) => {
    const name = status.padEnd(35)
    const num = String(count).padStart(5)
    console.log(`│ ${name} │ ${num} │`)
  })
  console.log('└─────────────────────────────────────┴───────┘')

  // 3. Recent Claims Activity (last 7 days)
  console.log('\n3️⃣ RECENT CLAIMS (last 7 days)')
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
      profiles (email)
    `)
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
    console.log('\n  No claims created in the last 7 days')
  }

  // 4. Claims with Missing Data
  console.log('\n4️⃣ DATA QUALITY CHECK')
  console.log('─'.repeat(80))

  const { data: allClaims } = await supabase
    .from('claims')
    .select('id, pdf_path, total_amount, status')

  const missingInvoice = allClaims?.filter(c => !c.pdf_path).length || 0
  const missingAmount = allClaims?.filter(c => !c.total_amount).length || 0
  const totalClaims = allClaims?.length || 0

  console.log(`\nTotal Claims: ${totalClaims}`)
  console.log(`Claims missing vet invoice: ${missingInvoice} (${Math.round(missingInvoice / totalClaims * 100)}%)`)
  console.log(`Claims missing amount: ${missingAmount} (${Math.round(missingAmount / totalClaims * 100)}%)`)

  console.log('\n' + '='.repeat(80) + '\n')
}

detailedStats().catch(console.error)
