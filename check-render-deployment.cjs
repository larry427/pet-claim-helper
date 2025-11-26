// Check if the duplicate SMS fix is deployed to production
const https = require('https');

const RENDER_SERVICE_URL = 'pet-claim-helper-backend.onrender.com';

// Check if the service is running and what version
https.get(`https://${RENDER_SERVICE_URL}/health`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Render health check:', res.statusCode, data);
  });
}).on('error', (err) => {
  console.error('Error checking Render:', err.message);
});

console.log('\n=== CHECKING RENDER DEPLOYMENT ===');
console.log('Service URL:', RENDER_SERVICE_URL);
console.log('\nNext: Check Render dashboard logs manually for:');
console.log('1. "Lock acquired" messages');
console.log('2. "Already sent today - skipping" messages');
console.log('3. Recent deployment timestamp');
