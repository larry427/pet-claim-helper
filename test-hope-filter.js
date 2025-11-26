// Simulate the filtering logic from MedicationsDashboard.tsx

const hopeMedication = {
  id: 'fa62ae79-891c-4471-a8a2-a0d95ec1cde6',
  medication_name: 'Hopeyyuckpills',
  start_date: '2025-11-15',
  end_date: '2025-11-15',
  pet_id: 'd7850412-056f-478e-a369-5688336856a4'
}

console.log('🔍 TESTING MEDICATION FILTER LOGIC')
console.log('='.repeat(80))
console.log('\nMedication:', hopeMedication.medication_name)
console.log('Start date:', hopeMedication.start_date)
console.log('End date:', hopeMedication.end_date)

// Simulate the filter logic
const today = new Date()
const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

console.log('\nCurrent date (local):', today.toISOString())
console.log('Today (normalized):', todayDay.toISOString())

const startDate = new Date(hopeMedication.start_date)
const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())

const endDate = hopeMedication.end_date ? new Date(hopeMedication.end_date) : null
const endDay = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null

console.log('\nStart day (normalized):', startDay.toISOString())
console.log('End day (normalized):', endDay?.toISOString())

// Check the condition
const isActive = todayDay >= startDay && (!endDay || todayDay <= endDay)

console.log('\n' + '─'.repeat(80))
console.log('FILTER LOGIC:')
console.log('  todayDay >= startDay:', todayDay >= startDay, `(${todayDay.getTime()} >= ${startDay.getTime()})`)
console.log('  todayDay <= endDay:', endDay ? todayDay <= endDay : 'N/A', endDay ? `(${todayDay.getTime()} <= ${endDay.getTime()})` : '')
console.log('  isActive:', isActive ? '✅ PASS' : '❌ FAIL')

if (!isActive) {
  console.log('\n🚨 PROBLEM: Medication filtered out!')
  console.log('   This medication will NOT appear in the dashboard')

  // Check if timezone is the issue
  const nowPST = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  console.log('\n📅 Current time in PST:', nowPST)

  if (todayDay > endDay) {
    console.log('\n❌ Root cause: Medication has already ended (todayDay > endDay)')
    console.log('   This is expected behavior for one-day medications after the day ends')
  } else if (todayDay < startDay) {
    console.log('\n❌ Root cause: Medication hasn\'t started yet (todayDay < startDay)')
  }
} else {
  console.log('\n✅ Medication SHOULD appear in dashboard')
  console.log('   If it\'s not showing, check:')
  console.log('   1. Frontend refreshKey is being updated')
  console.log('   2. Supabase query is returning the medication')
  console.log('   3. Pet grouping logic is working correctly')
}

console.log('\n' + '='.repeat(80))
