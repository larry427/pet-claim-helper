// Simulate the exact flow with Neo's data

console.log('\n' + '='.repeat(80))
console.log('🧪 TRACING NEO POLICY NUMBER FLOW')
console.log('='.repeat(80) + '\n')

// From database
const dbValue = 'nw432567'  // Neo's actual policy number from database

console.log('📥 Step 1: Database value')
console.log('   claim.pets.policy_number:', JSON.stringify(dbValue))
console.log()

// server/index.js line 1231
console.log('📦 Step 2: Building claimData (server/index.js:1231)')
const claimDataPolicyNumber = dbValue || 'N/A'
console.log('   Code: claim.pets.policy_number || "N/A"')
console.log('   Result:', JSON.stringify(claimDataPolicyNumber))
console.log()

// generateClaimPDF.js line 335
console.log('🔍 Step 3: getValueForField (generateClaimPDF.js:335)')
const fieldMapValue = claimDataPolicyNumber  // Just returns claimData.policyNumber
console.log('   Code: claimData.policyNumber')
console.log('   Result:', JSON.stringify(fieldMapValue))
console.log()

// generateClaimPDF.js line 102-105
console.log('⚖️  Step 4: Skip check (generateClaimPDF.js:102-105)')
const value = fieldMapValue
console.log('   value =', JSON.stringify(value))
console.log('   !value =', !value)
console.log('   value !== false =', value !== false)
const wouldSkip = !value && value !== false
console.log('   !value && value !== false =', wouldSkip)
console.log()

if (wouldSkip) {
  console.log('   ❌ Field would be SKIPPED')
} else {
  console.log('   ✅ Field would be FILLED')
  console.log('   Writing to PDF field "Policy number":', JSON.stringify(value))
}
console.log()

// Final verdict
console.log('='.repeat(80))
console.log(`🎯 FINAL RESULT: Neo's policy number "${dbValue}" would be written to PDF`)
console.log('='.repeat(80) + '\n')

// Now test with empty string (what we found Hope has)
console.log('\n' + '='.repeat(80))
console.log('🧪 NOW TESTING WITH EMPTY STRING (like Hope)')
console.log('='.repeat(80) + '\n')

const emptyDbValue = ''
console.log('📥 Step 1: Database value')
console.log('   claim.pets.policy_number:', JSON.stringify(emptyDbValue))
console.log('   Is empty string:', emptyDbValue === '')
console.log()

console.log('📦 Step 2: Building claimData (server/index.js:1231)')
const emptyClaimDataPolicyNumber = emptyDbValue || 'N/A'
console.log('   Code: claim.pets.policy_number || "N/A"')
console.log('   "" || "N/A" =', JSON.stringify(emptyClaimDataPolicyNumber))
console.log()

console.log('🔍 Step 3: getValueForField')
const emptyFieldMapValue = emptyClaimDataPolicyNumber
console.log('   Result:', JSON.stringify(emptyFieldMapValue))
console.log()

console.log('⚖️  Step 4: Skip check')
const emptyValue = emptyFieldMapValue
console.log('   value =', JSON.stringify(emptyValue))
console.log('   !value =', !emptyValue)
console.log('   value !== false =', emptyValue !== false)
const emptyWouldSkip = !emptyValue && emptyValue !== false
console.log('   !value && value !== false =', emptyWouldSkip)
console.log()

if (emptyWouldSkip) {
  console.log('   ❌ Field would be SKIPPED')
} else {
  console.log('   ✅ Field would be FILLED')
  console.log('   Writing to PDF field "Policy number":', JSON.stringify(emptyValue))
}
console.log()

console.log('='.repeat(80))
console.log(`🎯 FINAL RESULT: Empty policy_number becomes "${emptyClaimDataPolicyNumber}" in PDF`)
console.log('='.repeat(80) + '\n')
