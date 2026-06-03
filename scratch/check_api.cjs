const http = require('http');

http.get('http://localhost:5000/api/migrate/state', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Total emps from API:', json.employees ? json.employees.length : 'undefined');
    } catch (err) {
      console.log('Failed to parse JSON:', err.message);
      console.log('Raw output:', data.substring(0, 100));
    }
  });
}).on('error', err => {
  console.log('Error:', err.message);
});
