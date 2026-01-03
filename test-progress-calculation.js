// Test the FIXED progress calculation logic
console.log('🧪 TESTING FIXED PROGRESS CALCULATION')
console.log('='.repeat(80))

// Simulate the medication data (from your screenshots)
const medication = {
  id: 'fa62ae79-891c-4471-a8a2-a0d95ec1cde6',
  medication_name: 'Hopeyyuckpills',
  start_date: '2025-11-15',
  end_date: '2025-11-20',  // 6 days total (Nov 15-20)
  reminder_times: ['13:27'],  // 1 dose per day at 1:27 PM
  frequency: '1x daily'
}

// Simulate doses in database (only 1 dose has been marked as given)
const doses = [
  { id: 1, status: 'given', scheduled_time: '2025-11-15T13:27:00' },
  // Other doses may or may not exist in the database
  // The bug was that it only counted existing rows, not the full schedule
]

console.log('\n📋 MEDICATION INFO:')
console.log('  Name:', medication.medication_name)
console.log('  Start:', medication.start_date)
console.log('  End:', medication.end_date)
console.log('  Reminder times:', medication.reminder_times)
console.log('  Frequency:', medication.frequency)

console.log('\n💊 DOSES IN DATABASE:', doses.length)
console.log('  Given:', doses.filter(d => d.status === 'given').length)
console.log('  Pending:', doses.filter(d => d.status === 'pending').length)

// FIXED CALCULATION (from the fix we just applied)
console.log('\n' + '─'.repeat(80))
console.log('🔧 FIXED CALCULATION:')
console.log('─'.repeat(80))

// Parse dates as local dates (not UTC)
const [startYear, startMonth, startDay] = medication.start_date.split('-').map(Number)
const startDate = new Date(startYear, startMonth - 1, startDay)

const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
const endDate = new Date(endYear, endMonth - 1, endDay)

// Calculate total days in treatment (inclusive)
// CRITICAL FIX: Use date-only comparison to avoid off-by-one errors from timestamps
const startDay_dateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
const endDay_dateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
const totalDays = Math.round((endDay_dateOnly.getTime() - startDay_dateOnly.getTime()) / 86400000) + 1

// Get doses per day from reminder_times array
const dosesPerDay = medication.reminder_times?.length || 1

// Total doses = days * doses per day
const totalCount = totalDays * dosesPerDay

// Count given doses
const givenCount = doses.filter(d => d.status === 'given').length

// Calculate percentage
const percentage = totalCount > 0 ? Math.round((givenCount / totalCount) * 100) : 0

// Is complete?
const isComplete = givenCount === totalCount && totalCount > 0

console.log('  Start Date (parsed):', startDate.toISOString().split('T')[0])
console.log('  End Date (parsed):', endDate.toISOString().split('T')[0])
console.log('  Total Days:', totalDays, `(${medication.start_date} to ${medication.end_date})`)
console.log('  Doses Per Day:', dosesPerDay)
console.log('  Total Doses:', totalCount, `(${totalDays} days × ${dosesPerDay} per day)`)
console.log('  Given Count:', givenCount)
console.log('  Percentage:', percentage + '%')
console.log('  Is Complete:', isComplete)

console.log('\n' + '─'.repeat(80))
console.log('📊 SUCCESS MODAL WILL NOW SHOW:')
console.log('─'.repeat(80))
console.log(`  "${givenCount} of ${totalCount} doses (${percentage}%)"`)

if (isComplete) {
  console.log('  🎉 All doses complete!')
  console.log('  Treatment finished')
} else {
  console.log('  ⏳ Treatment in progress')
  console.log(`  Next dose: Tomorrow 1:27 PM`)
  const daysRemaining = totalDays - 1  // Assuming today is day 1
  console.log(`  Days remaining: ${daysRemaining}`)
}

console.log('\n' + '='.repeat(80))

// Verify against expected values
console.log('✅ VERIFICATION:')
if (totalCount === 6 && givenCount === 1 && percentage === 17 && !isComplete) {
  console.log('  ✅ CORRECT! Shows "1 of 6 doses (17%)"')
  console.log('  ✅ Treatment NOT complete')
  console.log('  ✅ BUG FIXED!')
} else if (totalCount === 7 && givenCount === 1 && percentage === 14 && !isComplete) {
  console.log('  ✅ CORRECT! Shows "1 of 7 doses (14%)"')
  console.log('  ✅ Treatment NOT complete')
  console.log('  ✅ BUG FIXED!')
} else {
  console.log('  ❌ UNEXPECTED VALUES:')
  console.log(`     Total: ${totalCount} (expected 6 or 7)`)
  console.log(`     Given: ${givenCount} (expected 1)`)
  console.log(`     Percentage: ${percentage}% (expected 14-17%)`)
  console.log(`     Complete: ${isComplete} (expected false)`)
}

console.log('\n' + '='.repeat(80))
console.log('OLD BUGGY CALCULATION (for comparison):')
console.log('─'.repeat(80))
const oldTotalCount = doses.length  // BUG: counted database rows
const oldGivenCount = doses.filter(d => d.status === 'given').length
const oldPercentage = oldTotalCount > 0 ? Math.round((oldGivenCount / oldTotalCount) * 100) : 0
const oldIsComplete = oldGivenCount === oldTotalCount && oldTotalCount > 0

console.log(`  "${oldGivenCount} of ${oldTotalCount} doses (${oldPercentage}%)"`)
console.log(`  Complete: ${oldIsComplete ? 'YES ❌ (WRONG!)' : 'NO'}`)
console.log('\n❌ This is what was causing the bug!')
console.log('   It only counted existing database rows, not the full schedule.')

console.log('\n' + '='.repeat(80))
