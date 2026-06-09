const fs = require('fs');
const content = fs.readFileSync('c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Dashboard.tsx', 'utf8');
const lines = content.split('\n');
let superAdminLineStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (role === \'Super Admin\') {')) {
    superAdminLineStart = i;
    break;
  }
}
if (superAdminLineStart === -1) {
    console.log('Super Admin block not found!');
} else {
    console.log('Found start at ' + superAdminLineStart);
    let curly = 0;
    for (let i = superAdminLineStart; i < lines.length; i++) {
        let line = lines[i];
        for(let j=0; j<line.length; j++) {
            if(line[j] === '{') curly++;
            if(line[j] === '}') curly--;
        }
        if (curly === 0) {
            console.log('Block closes at line ' + i);
            break;
        }
    }
}
