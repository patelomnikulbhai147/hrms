const http = require('http');

const loginData = JSON.stringify({ username: 'superadmin', password: 'default123' });

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.token) {
        console.log('Login successful! Token acquired.');
        fetchData(parsed.token, '/api/companies');
        fetchData(parsed.token, '/api/users');
      } else {
        console.log('Login failed:', parsed);
      }
    } catch(e) {
      console.log('Error parsing login response:', data);
    }
  });
});

req.on('error', err => console.error(err));
req.write(loginData);
req.end();

function fetchData(token, path) {
  const req2 = http.request({
    hostname: 'localhost',
    port: 5000,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, (res2) => {
    let data2 = '';
    res2.on('data', chunk => data2 += chunk);
    res2.on('end', () => {
      try {
        const parsed2 = JSON.parse(data2);
        console.log(`[${path}] Status: ${res2.statusCode}`);
        if (Array.isArray(parsed2)) {
          console.log(`[${path}] Array length:`, parsed2.length);
        } else {
          console.log(`[${path}] Response:`, parsed2);
        }
      } catch(e) {
        console.log(`[${path}] JSON parse error:`, data2.substring(0, 100));
      }
    });
  });
  req2.on('error', err => console.error(err));
  req2.end();
}
