const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 'user-id' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

async function run() {
  try {
    const res = await fetch('http://localhost:5000/api/payroll', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-workspace-id': 'c-siddhpur'
      }
    });
    if(!res.ok) {
        console.log("Error status:", res.status);
    } else {
        const json = await res.json();
        console.log("Returned length:", json.length);
    }
  } catch(e) {
    console.error("API error:", e.message);
  }
}
run();
