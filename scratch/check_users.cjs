const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/users',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", body);
  });
});

req.on('error', console.error);
req.end();
