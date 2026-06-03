const fetch = require('../node_modules/node-fetch');
const jwt = require('jsonwebtoken');

async function testCreate() {
  const token = jwt.sign({ id: 'u-superadmin', role: 'Super Admin', companyId: 'c-gcri' }, 'enterprise_hrms_super_secret_key_2026');
  
  const payload = {
    id: 'emp-gcri-e9999',
    employeeId: 'E9999',
    companyId: 'c-gcri',
    name: 'TEST',
    email: 'test@gcri.in',
    phone: '+91 9876543210',
    department: 'Nursing',
    designation: 'Nurse',
    role: 'Staff',
    status: 'Active',
    joinDate: '2026-05-20',
    location: 'Ahmedabad, Gujarat',
    avatar: 'TE',
    salary: 32000,
    manager: 'Dr. Suresh Babu',
    firstName: 'TEST',
    middleName: '',
    lastName: 'NAME',
    aadhaarName: 'TEST',
    gender: 'Female',
    dob: '1998-08-10',
    maritalStatus: 'UNMARRIED',
    nationality: 'INDIAN',
    fatherSpouseName: '',
    relationType: 'FATHER',
    emergencyContact: '',
    category: 'Skilled',
    employmentType: 'CONTRACTUAL',
    exitDate: '',
    exitReason: '',
    serviceBookNo: '',
    branchLocation: 'AHMEDABAD',
    aadhaar: '123456789012',
    pan: 'ABCDE1234F',
    pfNumber: '',
    uan: '',
    esic: '',
    bankName: 'State Bank of India',
    accountNumber: '1234567890',
    ifsc: 'SBIN0001234',
    presentAddress: '123 Test St',
    permanentAddress: ''
  };

  try {
    const res = await fetch('http://localhost:5000/api/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}

testCreate();
