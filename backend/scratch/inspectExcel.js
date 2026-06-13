const XLSX = require('xlsx');

const file = 'C:/Users/HP/OneDrive/Desktop/GCRI FINAL MASTER DATA FROM 01.11......xlsx';
const wb = XLSX.readFile(file, { cellDates: true });
console.log('SHEETS:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  console.log(`\n===== SHEET: "${name}" =====`);
  console.log('dimensions:', ws['!ref'], '| data rows (json):', rows.length);
  if (rows.length) {
    console.log('COLUMNS:', JSON.stringify(Object.keys(rows[0])));
    console.log('FIRST ROW:', JSON.stringify(rows[0]));
    if (rows[1]) console.log('SECOND ROW:', JSON.stringify(rows[1]));
    if (rows[rows.length-1]) console.log('LAST ROW:', JSON.stringify(rows[rows.length-1]));
  } else {
    // dump first few raw rows as array
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
    console.log('RAW first 8 rows:');
    arr.slice(0,8).forEach((r,i)=>console.log(i, JSON.stringify(r)));
  }
}
