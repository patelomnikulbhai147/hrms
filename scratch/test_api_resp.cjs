fetch('http://localhost:5000/api/companies/c-gcri', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
}).then(res => res.json()).then(console.log).catch(console.error);
