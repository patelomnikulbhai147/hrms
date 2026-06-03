const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/employees',
  method: 'GET',
  headers: {
    // Need a valid token to bypass auth. I'll just check the DB directly to see if companyId is correct.
  }
};
