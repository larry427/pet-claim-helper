/**
 * Test phone number formatting for E.164 compliance
 * Verifies server-side formatting matches expected Twilio format
 */

// Inline copy of the formatPhoneToE164 function to test
function formatPhoneToE164(input) {
  if (!input) return ''

  // Strip all non-digits (remove spaces, dashes, parentheses, +)
  const digits = String(input).replace(/\D/g, '')

  // Handle 10-digit US number: add +1 prefix
  if (digits.length === 10) {
    return `+1${digits}`
  }

  // Handle 11-digit number starting with 1: add + prefix
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // Already in E.164 format with + prefix
  if (input.startsWith('+') && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // Invalid format - return as-is for Twilio to reject with clear error
  console.warn('[Phone Format] Invalid phone number format:', input, '- extracted digits:', digits)
  return input
}

console.log('='.repeat(80))
console.log('PHONE NUMBER E.164 FORMATTING TEST')
console.log('='.repeat(80))
console.log()

// Test cases from user requirements
const testCases = [
  { input: '312 305 0403', expected: '+13123050403', description: 'Spaces' },
  { input: '(312) 305-0403', expected: '+13123050403', description: 'Parentheses and dashes' },
  { input: '3123050403', expected: '+13123050403', description: 'Plain 10 digits' },
  { input: '+13123050403', expected: '+13123050403', description: 'Already E.164 format' },
  { input: '13123050403', expected: '+13123050403', description: '11 digits starting with 1' },
  { input: '1-312-305-0403', expected: '+13123050403', description: '11 digits with dashes' },
  { input: '', expected: '', description: 'Empty string' },
  { input: '123', expected: '123', description: 'Invalid - too short' },
  { input: '31230504039999', expected: '31230504039999', description: 'Invalid - too long' },
]

let passed = 0
let failed = 0

testCases.forEach(({ input, expected, description }, index) => {
  const result = formatPhoneToE164(input)
  const isPass = result === expected

  if (isPass) {
    passed++
    console.log(`✅ Test ${index + 1}: ${description}`)
  } else {
    failed++
    console.log(`❌ Test ${index + 1}: ${description}`)
  }

  console.log(`   Input:    "${input}"`)
  console.log(`   Expected: "${expected}"`)
  console.log(`   Got:      "${result}"`)
  console.log()
})

console.log('='.repeat(80))
console.log(`RESULTS: ${passed} passed, ${failed} failed`)
console.log('='.repeat(80))

if (failed > 0) {
  process.exit(1)
}
