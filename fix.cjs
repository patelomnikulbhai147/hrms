const fs = require('fs'); 
let c = fs.readFileSync('src/pages/Payroll.tsx', 'utf8'); 
const start = c.indexOf('              <Input\n                label="Transaction Reference"'); 
if (start > -1) { 
    const end = c.indexOf('</ActionConfirmationModal>', start) + 26; 
    c = c.substring(0, start) + c.substring(end); 
    fs.writeFileSync('src/pages/Payroll.tsx', c); 
} else {
    console.log("Could not find start index");
}
