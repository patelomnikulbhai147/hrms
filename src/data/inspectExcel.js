import XLSX from 'xlsx';
import path from 'path';

const file = path.resolve('GCRI_FINAL_MASTER_DATA.xlsx');
const workbook = XLSX.readFile(file);

workbook.SheetNames.forEach(sheetName => {
  if (sheetName === 'Sheet1') return;
  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const headerIdx = sheetName === 'AHMEDABAD' ? 1 : 2;
  console.log(`\n========================================`);
  console.log(`Headers for [${sheetName}] at index ${headerIdx}:`);
  const headers = json[headerIdx];
  headers.forEach((h, idx) => {
    console.log(`  [${idx}]: "${h}"`);
  });
});
