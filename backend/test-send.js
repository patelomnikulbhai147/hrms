const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { sendOtpEmail } = require('./src/services/emailService');

console.log("Sending test OTP email to patelnikul8264@gmail.com...");
sendOtpEmail('patelnikul8264@gmail.com', '555666', 'Patel Nikul', 10)
  .then(res => console.log('SMTP Delivery Result:', res))
  .catch(err => console.error('SMTP Delivery Error:', err));
