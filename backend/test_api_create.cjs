const http = require('http');

const loginData = JSON.stringify({ username: 'superadmin', password: 'default123' });
const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const token = JSON.parse(data).token;
    
    const uniqueId = Math.floor(Math.random() * 1000);
    const postData = JSON.stringify({
      name: 'Test Officer API',
      email: `testapi${uniqueId}@gcri.com`,
      username: `testapi${uniqueId}`,
      password: 'password123',
      role: 'Company Head',
      companyId: 'c-gcri'
    });

    const req2 = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/users',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        console.log(`STATUS: ${res2.statusCode}`);
        console.log(`BODY: ${data2}`);
      });
    });
    req2.write(postData);
    req2.end();
  });
});
req.write(loginData);
req.end();
