require('dotenv').config();
const https = require('https');

const key = process.env.BREVO_API_KEY;
console.log('Key found:', key ? 'YES - ' + key.slice(0,15) : 'NO');

const body = JSON.stringify({
  sender: { name: 'Smart Campus', email: 'amrojamhour4@gmail.com' },
  to: [{ email: 's12143698@stu.najah.edu', name: 'Amr' }],
  subject: 'Test Email from Smart Campus',
  htmlContent: '<h1>Test - Code: 123456</h1>'
});

const req = https.request({
  hostname: 'api.brevo.com',
  path: '/v3/smtp/email',
  method: 'POST',
  headers: {
    'api-key': key,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', raw);
  });
});
req.write(body);
req.end();