const http = require('http');

http.get('http://localhost:5000/api/companies', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
}).on('error', console.error);
