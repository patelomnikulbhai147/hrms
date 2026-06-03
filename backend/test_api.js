const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:5000/api/payroll', {
      headers: {
        'x-workspace-id': 'c-siddhpur',
        // Wait, auth middleware requires token!
        // We can't bypass it. Let's just create a test token!
      }
    });
    console.log(res.data.length);
  } catch (e) {
    console.log("Failed", e.message);
  }
}
test();
