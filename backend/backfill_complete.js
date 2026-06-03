const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

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

const cleanExcelDate = (val) => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str === '-') {
    return null;
  }
  
  const num = Number(str);
  if (!isNaN(num) && num > 10000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let y = parts[2].length === 2 ? '19' + parts[2] : parts[2];
      return `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return str;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return str;
};

async function backfillComplete() {
  let updatedCount = 0;
  let missingCount = 0;

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'Sheet1') continue;
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const dataStartIdx = sheetName === 'AHMEDABAD' ? 2 : 3;
    if (json.length <= dataStartIdx) continue;

    for (let i = dataStartIdx; i < json.length; i++) {
      const row = json[i];
      if (!row || row.length === 0) continue;

      let empCode = cleanExcelValue(row[1]);
      if (!empCode) continue;

      let dob, gender, maritalStatus, nationality, fatherSpouseName, relationType, emergencyContact, employmentType, serviceBookNo, category;
      let firstName, lastName, middleName, phone, pfNumber, uan, pan, esiNumber, aadhaar, accountNumber, bankName, ifsc, presentAddress, permanentAddress, exitDate, exitReason;

      // Extract gender Standard
      let rawGender = sheetName === 'AHMEDABAD' ? cleanExcelValue(row[6]) : cleanExcelValue(row[7]);
      if (rawGender) {
        if (rawGender.toUpperCase() === 'M' || rawGender.toUpperCase() === 'MALE') gender = 'Male';
        else if (rawGender.toUpperCase() === 'F' || rawGender.toUpperCase() === 'FEMALE') gender = 'Female';
        else gender = rawGender;
      }

      if (sheetName === 'AHMEDABAD') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        fatherSpouseName = cleanExcelValue(row[7]);
        relationType = cleanExcelValue(row[8]);
        dob = cleanExcelDate(row[9]);
        maritalStatus = cleanExcelValue(row[10]);
        nationality = cleanExcelValue(row[11]) || 'INDIAN';
        category = cleanExcelValue(row[15]);
        employmentType = cleanExcelValue(row[16]);
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
        serviceBookNo = cleanExcelValue(row[28]);
      } else if (sheetName === 'BHAVNAGAR' || sheetName === 'RAJKOT') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        fatherSpouseName = cleanExcelValue(row[6]);
        relationType = cleanExcelValue(row[8]);
        dob = cleanExcelDate(row[9]);
        maritalStatus = cleanExcelValue(row[10]);
        nationality = cleanExcelValue(row[11]) || 'INDIAN';
        category = cleanExcelValue(row[15]);
        employmentType = cleanExcelValue(row[16]);
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
        serviceBookNo = cleanExcelValue(row[28]);
      } else if (sheetName === 'SIDDHPUR') {
        firstName = cleanExcelValue(row[5]);
        lastName = cleanExcelValue(row[4]);
        middleName = cleanExcelValue(row[6]);
        fatherSpouseName = middleName;
        dob = cleanExcelDate(row[8]);
        relationType = cleanExcelValue(row[9]);
        maritalStatus = cleanExcelValue(row[10]);
        nationality = cleanExcelValue(row[11]) || 'INDIAN';
        category = cleanExcelValue(row[15]);
        employmentType = cleanExcelValue(row[16]);
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
        serviceBookNo = cleanExcelValue(row[28]);
      }

      const updateData = {};
      // ONLY add properties if they exist in source so we don't accidentally wipe anything with null
      if (dob) updateData.dob = dob;
      if (gender) updateData.gender = gender;
      if (maritalStatus) updateData.maritalStatus = maritalStatus;
      if (nationality) updateData.nationality = nationality;
      if (fatherSpouseName) updateData.fatherSpouseName = fatherSpouseName;
      if (emergencyContact) updateData.emergencyContact = emergencyContact;
      if (relationType) updateData.relationType = relationType;
      if (serviceBookNo) updateData.serviceBookNo = serviceBookNo;
      if (employmentType) updateData.employmentType = employmentType;
      if (category) updateData.category = category;
      
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (middleName) updateData.middleName = middleName;
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

  console.log(`Backfill completed safely. Updated ${updatedCount} records.`);
}

backfillComplete()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
