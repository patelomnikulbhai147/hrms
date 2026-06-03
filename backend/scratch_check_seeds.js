const fs = require('fs'); 
const content = fs.readFileSync('../src/data/excelSeededData.ts', 'utf8'); 
const lines = content.split('\n'); 
let bankNames = 0; let accs = 0; let phones = 0; 
lines.forEach(l => { 
  if (l.includes('"bankName":') && !l.includes('"-') && !l.includes('""')) bankNames++; 
  if (l.includes('"accountNumber":') && !l.includes('"-') && !l.includes('""')) accs++; 
  if (l.includes('"phone":') && !l.includes('"-') && !l.includes('""')) phones++; 
}); 
console.log({ bankNames, accs, phones });
