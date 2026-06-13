const fetch = require('node-fetch');

async function testApi() {
  try {
    const res = await fetch('http://localhost:5000/api/branches', {
      headers: {
        // Need to pass a valid token or bypass auth? Wait, the API requires auth!
      }
    });
  } catch(e) {}
}
