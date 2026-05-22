import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Pointing to the absolute Desktop path requested by the user
const file = 'C:\\Users\\HP\\OneDrive\\Desktop\\GCRI FINAL MASTER DATA FROM 01.11......xlsx';
console.log('Loading absolute Excel file:', file);

const workbook = XLSX.readFile(file);
const allEmployees = [];

const cleanExcelValue = (val) => {
  if (val === undefined || val === null) return '-';
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return '-';
  }
  return str;
};

const cleanExcelDate = (val) => {
  if (val === undefined || val === null) return '-';
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return '-';
  }
  
  // Check Excel date serial number
  const num = Number(str);
  if (!isNaN(num) && num > 10000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  // Handle DD/MM/YYYY format
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let d = parts[0].padStart(2, '0');
      let m = parts[1].padStart(2, '0');
      let y = parts[2];
      if (y.length === 2) {
        y = '19' + y;
      }
      return `${y}-${m}-${d}`;
    }
  }

  // Handle DD-MM-YYYY or YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return str; // YYYY-MM-DD
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  
  return str;
};

const getCompanyId = (sheetName) => {
  const name = sheetName.toUpperCase();
  if (name === 'AHMEDABAD') return 'c-ahmedabad';
  if (name === 'RAJKOT') return 'c-rajkot';
  if (name === 'BHAVNAGAR') return 'c-bhavnagar';
  if (name === 'SIDDHPUR') return 'c-siddhpur';
  return 'c-ahmedabad';
};

const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

workbook.SheetNames.forEach(sheetName => {
  if (sheetName === 'Sheet1') return;
  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const headerIdx = sheetName === 'AHMEDABAD' ? 1 : 2;
  const dataStartIdx = sheetName === 'AHMEDABAD' ? 2 : 3;

  if (json.length <= dataStartIdx) return;

  console.log(`Parsing sheet: ${sheetName}, start row: ${dataStartIdx}`);

  for (let i = dataStartIdx; i < json.length; i++) {
    const row = json[i];
    if (!row || row.length === 0) continue;

    let empCode = '';
    let fullName = '';
    
    // Map column offsets correctly based on the sheet schema
    empCode = cleanExcelValue(row[1]);
    fullName = cleanExcelValue(row[2]);

    // Skip empty lines
    if (empCode === '-' && fullName === '-' && (!row[3] || String(row[3]).trim() === '')) {
      continue;
    }

    if (empCode === '-') {
      empCode = `TEMP-${sheetName.slice(0, 3).toUpperCase()}-${i}`;
    }
    if (fullName === '-') {
      fullName = 'Unknown Employee';
    }

    const companyId = getCompanyId(sheetName);

    // Schema mapping
    let firstName, surname, gender, fatherSpouseName, relationType, dob, maritalStatus, nationality, education, joinDate, designation, category, employmentType, phone;
    let pfNumber, uan, pan, esic, aadhaar, accountNumber, bankName, ifsc, presentAddress, permanentAddress, serviceBookNo, exitDate, exitReason;

    if (sheetName === 'AHMEDABAD') {
      firstName = cleanExcelValue(row[5]);
      surname = cleanExcelValue(row[4]);
      gender = cleanExcelValue(row[6]);
      fatherSpouseName = cleanExcelValue(row[7]);
      relationType = cleanExcelValue(row[8]);
      dob = cleanExcelDate(row[9]);
      maritalStatus = cleanExcelValue(row[10]);
      nationality = cleanExcelValue(row[11]);
      education = cleanExcelValue(row[12]);
      joinDate = cleanExcelDate(row[13]);
      designation = cleanExcelValue(row[14]);
      category = cleanExcelValue(row[15]);
      employmentType = cleanExcelValue(row[16]);
      phone = cleanExcelValue(row[17]);
      pfNumber = cleanExcelValue(row[18]);
      uan = cleanExcelValue(row[19]);
      pan = cleanExcelValue(row[20]);
      esic = cleanExcelValue(row[21]);
      aadhaar = cleanExcelValue(row[22]);
      accountNumber = cleanExcelValue(row[23]);
      bankName = cleanExcelValue(row[24]);
      ifsc = cleanExcelValue(row[25]);
      presentAddress = cleanExcelValue(row[26]);
      permanentAddress = cleanExcelValue(row[27]);
      serviceBookNo = cleanExcelValue(row[28]);
      exitDate = cleanExcelDate(row[29]);
      exitReason = cleanExcelValue(row[30]);
    } else if (sheetName === 'BHAVNAGAR' || sheetName === 'RAJKOT') {
      firstName = cleanExcelValue(row[5]);
      surname = cleanExcelValue(row[4]);
      fatherSpouseName = cleanExcelValue(row[6]);
      gender = cleanExcelValue(row[7]);
      relationType = cleanExcelValue(row[8]);
      dob = cleanExcelDate(row[9]);
      maritalStatus = cleanExcelValue(row[10]);
      nationality = cleanExcelValue(row[11]);
      education = cleanExcelValue(row[12]);
      joinDate = cleanExcelDate(row[13]);
      designation = cleanExcelValue(row[14]);
      category = cleanExcelValue(row[15]);
      employmentType = cleanExcelValue(row[16]);
      phone = cleanExcelValue(row[17]);
      uan = cleanExcelValue(row[18]);
      pfNumber = cleanExcelValue(row[19]);
      esic = cleanExcelValue(row[20]);
      pan = cleanExcelValue(row[21]);
      aadhaar = cleanExcelValue(row[22]);
      accountNumber = cleanExcelValue(row[23]);
      ifsc = cleanExcelValue(row[24]);
      bankName = cleanExcelValue(row[25]);
      presentAddress = cleanExcelValue(row[26]);
      permanentAddress = cleanExcelValue(row[27]);
      serviceBookNo = cleanExcelValue(row[28]);
      exitDate = cleanExcelDate(row[29]);
      exitReason = cleanExcelValue(row[30]);
    } else if (sheetName === 'SIDDHPUR') {
      firstName = cleanExcelValue(row[5]);
      surname = cleanExcelValue(row[4]);
      const middleName = cleanExcelValue(row[6]);
      gender = cleanExcelValue(row[7]);
      dob = cleanExcelDate(row[8]);
      relationType = cleanExcelValue(row[9]);
      maritalStatus = cleanExcelValue(row[10]);
      nationality = cleanExcelValue(row[11]);
      education = cleanExcelValue(row[12]);
      joinDate = cleanExcelDate(row[13]);
      designation = cleanExcelValue(row[14]);
      category = cleanExcelValue(row[15]);
      employmentType = cleanExcelValue(row[16]);
      phone = cleanExcelValue(row[17]);
      uan = cleanExcelValue(row[18]);
      pfNumber = cleanExcelValue(row[19]);
      esic = cleanExcelValue(row[20]);
      pan = cleanExcelValue(row[21]);
      aadhaar = cleanExcelValue(row[22]);
      accountNumber = cleanExcelValue(row[23]);
      ifsc = cleanExcelValue(row[24]);
      bankName = cleanExcelValue(row[25]);
      presentAddress = cleanExcelValue(row[26]);
      permanentAddress = cleanExcelValue(row[27]);
      serviceBookNo = cleanExcelValue(row[28]);
      exitDate = cleanExcelDate(row[29]);
      exitReason = cleanExcelValue(row[30]);
      fatherSpouseName = middleName !== '-' ? middleName : '-';
    }

    // Gender standardization
    let genderStandard = 'Female';
    if (gender.toUpperCase() === 'M' || gender.toUpperCase() === 'MALE') {
      genderStandard = 'Male';
    } else if (gender.toUpperCase() === 'F' || gender.toUpperCase() === 'FEMALE') {
      genderStandard = 'Female';
    }

    // Salary computation base logic
    let baseSalary = 18000;
    if (designation !== '-' && (designation.toLowerCase().includes('nurse') || designation.toLowerCase().includes('sister'))) {
      baseSalary = 38000;
    } else if (category !== '-' && category.toLowerCase() === 'skilled') {
      baseSalary = 32000;
    } else if (category !== '-' && category.toLowerCase() === 'semi-skilled') {
      baseSalary = 24000;
    } else if (category !== '-' && category.toLowerCase() === 'highly skilled') {
      baseSalary = 48000;
    }

    const email = `${firstName !== '-' ? firstName.toLowerCase().replace(/\s+/g, '') : 'employee'}@${sheetName.toLowerCase()}.gcri.in`;

    const employee = {
      id: `emp-gcri-${empCode}`,
      employeeId: empCode,
      companyId: companyId,
      name: fullName,
      email: email,
      phone: phone,
      department: designation.toLowerCase().includes('nurse') ? 'Nursing' : 'Clinical',
      designation: designation,
      role: 'Staff',
      status: exitDate !== '-' ? 'Inactive' : 'Active',
      joinDate: joinDate !== '-' ? joinDate : '2022-11-01',
      location: `${capitalize(sheetName)}, Gujarat`,
      avatar: firstName !== '-' ? firstName.slice(0, 2).toUpperCase() : 'EM',
      salary: baseSalary,
      manager: 'Dr. Suresh Babu',
      
      firstName,
      middleName: surname,
      lastName: surname,
      aadhaarName: cleanExcelValue(row[3]) !== '-' ? cleanExcelValue(row[3]) : fullName,
      gender: genderStandard,
      dob,
      maritalStatus,
      nationality: nationality !== '-' ? nationality : 'INDIAN',
      fatherSpouseName,
      relationType,
      category,
      employmentType: employmentType !== '-' ? employmentType : 'CONTRACTUAL',
      exitDate: exitDate !== '-' ? exitDate : '',
      exitReason: exitReason !== '-' ? exitReason : '',
      serviceBookNo,
      branchLocation: sheetName.toUpperCase(),
      aadhaar,
      pan,
      pfNumber,
      uan,
      esic,
      bankName,
      accountNumber,
      ifsc,
      presentAddress,
      permanentAddress
    };

    allEmployees.push(employee);
  }
});

// Sort by Employee Code in ascending natural order
allEmployees.sort((a, b) => {
  return a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true, sensitivity: 'base' });
});

console.log(`Parsed total of ${allEmployees.length} employees.`);

// Write the parsed objects inside excelSeededData.ts
const outputPath = path.resolve('src/data/excelSeededData.ts');

const fileContent = `import { type Employee } from './mockData';

export const excelSeededEmployees: Employee[] = ${JSON.stringify(allEmployees, null, 2)};

export const allExcelParsedEmployees: Employee[] = excelSeededEmployees;
`;

fs.writeFileSync(outputPath, fileContent, 'utf-8');
console.log('Successfully wrote parsed employees to src/data/excelSeededData.ts');
