const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cmdxcmdlc2hrZ3ZzZnduenp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNTU3NTEsImV4cCI6MjA3Njc0MTc1MX0.PpQa22hWN7OAl8LP_h9mhxfogUaV1qmSuOiaBeaLDh4'

const parts = jwt.split('.')
const header = JSON.parse(Buffer.from(parts[0], 'base64').toString())
const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

console.log('Header:', header)
console.log('Payload:', payload)
console.log('Ref in key:', payload.ref)
console.log('Expected ref: hyrgqrgeshkgvsfwnzzu')
console.log('Match:', payload.ref === 'hyrgqrgeshkgvsfwnzzu')
console.log('Expiry date:', new Date(payload.exp * 1000))
console.log('Is expired:', Date.now() > payload.exp * 1000)
