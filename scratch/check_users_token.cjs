const http = require('http');

async function test() {
  const loginRes = await new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.write(JSON.stringify({ username: 'superadmin', password: 'default123' }));
    req.end();
  });

  console.log("Login token:", loginRes.token ? 'YES' : 'NO');
  
  if (!loginRes.token) {
    console.log("Login failed!", loginRes);
    return;
  }

  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/users',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + loginRes.token
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log("Users Status:", res.statusCode);
      console.log("Users:", body);
    });
  });
  req.end();
}

test();
