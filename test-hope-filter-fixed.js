// Test the FIXED filtering logic

const hopeMedication = {
  id: 'fa62ae79-891c-4471-a8a2-a0d95ec1cde6',
  medication_name: 'Hopeyyuckpills',
  start_date: '2025-11-15',
  end_date: '2025-11-15',
  pet_id: 'd7850412-056f-478e-a369-5688336856a4'
}

console.log('🔍 TESTING FIXED MEDICATION FILTER LOGIC')
console.log('='.repeat(80))
console.log('\nMedication:', hopeMedication.medication_name)
console.log('Start date:', hopeMedication.start_date)
console.log('End date:', hopeMedication.end_date)

// FIXED: Parse dates as local date, not UTC
const today = new Date()
const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

console.log('\nCurrent date:', today.toISOString())
console.log('Today (normalized):', todayDay.toISOString())

// FIXED: Parse start_date as local date
const [startYear, startMonth, startDay] = hopeMedication.start_date.split('-').map(Number)
const startDate = new Date(startYear, startMonth - 1, startDay)

// FIXED: Parse end_date as local date
const [endYear, endMonth, endDay] = hopeMedication.end_date.split('-').map(Number)
const endDate = new Date(endYear, endMonth - 1, endDay)

console.log('\nStart date (parsed as local):', startDate.toISOString())
console.log('End date (parsed as local):', endDate.toISOString())

// Check the condition
const isActive = todayDay >= startDate && (!endDate || todayDay <= endDate)

console.log('\n' + '─'.repeat(80))
console.log('FILTER LOGIC:')
console.log('  todayDay >= startDate:', todayDay >= startDate, `(${todayDay.getTime()} >= ${startDate.getTime()})`)
console.log('  todayDay <= endDate:', todayDay <= endDate, `(${todayDay.getTime()} <= ${endDate.getTime()})`)
console.log('  isActive:', isActive ? '✅ PASS' : '❌ FAIL')

if (isActive) {
  console.log('\n✅ SUCCESS! Medication will appear in dashboard')
} else {
  console.log('\n❌ STILL FAILING - check date parsing')
}

console.log('\n' + '='.repeat(80))
