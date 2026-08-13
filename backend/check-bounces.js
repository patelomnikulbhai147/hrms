const tls = require('tls');
require('dotenv').config({ path: './.env' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const client = tls.connect(993, 'imap.gmail.com', () => {
  let state = 0;
  let responseBuffer = '';

  client.on('data', (data) => {
    responseBuffer += data.toString();
    const lines = responseBuffer.split('\r\n');
    
    while (lines.length > 1) {
      const line = lines.shift();
      
      if (state === 0 && line.includes('* OK')) {
        client.write(`A1 LOGIN ${user} ${pass}\r\n`);
        state = 1;
      } else if (state === 1 && line.includes('A1 OK')) {
        client.write('A2 SELECT INBOX\r\n');
        state = 2;
      } else if (state === 2 && line.includes('A2 OK')) {
        // Fetch full body of message 442
        client.write('A3 FETCH 442 BODY[TEXT]\r\n');
        state = 3;
      } else if (state === 3 && line.includes('A3 OK')) {
        client.write('A4 LOGOUT\r\n');
        state = 4;
      } else if (state === 4 && line.includes('A4 OK')) {
        client.end();
      } else {
        // Print lines of the body
        if (state === 3) {
          console.log(line);
        }
      }
    }
    responseBuffer = lines[0];
  });
});
