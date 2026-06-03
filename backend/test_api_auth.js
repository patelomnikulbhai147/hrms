const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 'user-id' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

async function run() {
  try {
    const res = await axios.get('http://localhost:5000/api/payroll', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-workspace-id': 'c-siddhpur'
      }
    });
    console.log("Returned length:", res.data.length);
  } catch(e) {
    console.error("API error:", e.response ? e.response.status : e.message);
  }
}
run();
