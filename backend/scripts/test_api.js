async function testApi() {
  try {
    const res = await fetch('http://localhost:5000/api/bank/verify-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Assuming some mock auth if required, but maybe not if no auth middleware
        'Authorization': 'Bearer test'
      },
      body: JSON.stringify({
        ifsc: 'HDFC0001234',
        accountNumber: '112233445566',
        employeeId: 311,
        companyId: 1
      })
    });
    
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
testApi();
