const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/employees',
  method: 'GET',
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data.substring(0, 500)}`);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
