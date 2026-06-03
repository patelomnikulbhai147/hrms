const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

const file = 'C:\\Users\\HP\\OneDrive\\Desktop\\GCRI FINAL MASTER DATA FROM 01.11......xlsx';
console.log('Loading absolute Excel file:', file);

const workbook = XLSX.readFile(file);

const cleanExcelValue = (val) => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str === '-') {
    return null;
  }
  return str;
};

async function backfill() {
  let updatedCount = 0;
  let missingCount = 0;

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'Sheet1') continue;
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const dataStartIdx = sheetName === 'AHMEDABAD' ? 2 : 3;
    if (json.length <= dataStartIdx) continue;

    console.log(`Processing sheet: ${sheetName}`);

    for (let i = dataStartIdx; i < json.length; i++) {
      const row = json[i];
      if (!row || row.length === 0) continue;

      let empCode = cleanExcelValue(row[1]);
      if (!empCode) continue;

      let phone, pfNumber, uan, pan, esiNumber, aadhaar, accountNumber, bankName, ifsc, presentAddress, permanentAddress, firstName, middleName, lastName;

      if (sheetName === 'AHMEDABAD') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        phone = cleanExcelValue(row[17]);
        pfNumber = cleanExcelValue(row[18]);
        uan = cleanExcelValue(row[19]);
        pan = cleanExcelValue(row[20]);
        esiNumber = cleanExcelValue(row[21]);
        aadhaar = cleanExcelValue(row[22]);
        accountNumber = cleanExcelValue(row[23]);
        bankName = cleanExcelValue(row[24]);
        ifsc = cleanExcelValue(row[25]);
        presentAddress = cleanExcelValue(row[26]);
        permanentAddress = cleanExcelValue(row[27]);
      } else if (sheetName === 'BHAVNAGAR' || sheetName === 'RAJKOT') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        phone = cleanExcelValue(row[17]);
        uan = cleanExcelValue(row[18]);
        pfNumber = cleanExcelValue(row[19]);
        esiNumber = cleanExcelValue(row[20]);
        pan = cleanExcelValue(row[21]);
        aadhaar = cleanExcelValue(row[22]);
        accountNumber = cleanExcelValue(row[23]);
        ifsc = cleanExcelValue(row[24]);
        bankName = cleanExcelValue(row[25]);
        presentAddress = cleanExcelValue(row[26]);
        permanentAddress = cleanExcelValue(row[27]);
      } else if (sheetName === 'SIDDHPUR') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        middleName = cleanExcelValue(row[6]);
        phone = cleanExcelValue(row[17]);
        uan = cleanExcelValue(row[18]);
        pfNumber = cleanExcelValue(row[19]);
        esiNumber = cleanExcelValue(row[20]);
        pan = cleanExcelValue(row[21]);
        aadhaar = cleanExcelValue(row[22]);
        accountNumber = cleanExcelValue(row[23]);
        ifsc = cleanExcelValue(row[24]);
        bankName = cleanExcelValue(row[25]);
        presentAddress = cleanExcelValue(row[26]);
        permanentAddress = cleanExcelValue(row[27]);
      }

      const updateData = {};
      if (phone) updateData.phone = phone;
      if (pfNumber) updateData.pfNumber = pfNumber;
      if (uan) updateData.uan = uan;
      if (pan) updateData.pan = pan;
      if (esiNumber) updateData.esiNumber = esiNumber;
      if (aadhaar) updateData.aadhaar = aadhaar;
      if (accountNumber) updateData.accountNumber = accountNumber;
      if (bankName) updateData.bankName = bankName;
      if (ifsc) updateData.ifsc = ifsc;
      if (presentAddress) updateData.presentAddress = presentAddress;
      if (permanentAddress) updateData.permanentAddress = permanentAddress;
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (middleName) updateData.middleName = middleName;

      if (Object.keys(updateData).length > 0) {
        try {
          const res = await prisma.employee.updateMany({
            where: { employeeId: empCode },
            data: updateData
          });
          if (res.count > 0) {
            updatedCount += res.count;
          } else {
            missingCount++;
          }
        } catch (err) {
          console.error(`Failed to update ${empCode}:`, err.message);
        }
      }
    }
  }

  console.log(`Backfill completed. Successfully updated ${updatedCount} records. Could not find ${missingCount} employees in DB.`);
}

backfill()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
