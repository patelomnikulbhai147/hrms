const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    const data = {
      id: "emp-gcri-e9999",
      employeeId: "E9999",
      companyId: "c-gcri",
      name: "TEST EMPLOYEE NAME",
      email: "test.e9999@gcri.in",
      phone: "+91 9876543210",
      department: "Nursing",
      designation: "Staff Nurse",
      role: "Staff",
      status: "Active",
      joinDate: new Date("2026-05-20"),
      location: "Ahmedabad, Gujarat",
      avatar: "TE",
      salary: 32000,
      manager: "Dr. Suresh Babu",
      firstName: "TEST",
      middleName: "",
      lastName: "NAME",
      aadhaarName: "TEST EMPLOYEE NAME",
      gender: "Female",
      dob: "1998-08-10",
      maritalStatus: "UNMARRIED",
      nationality: "INDIAN",
      fatherSpouseName: "",
      relationType: "FATHER",
      emergencyContact: "",
      category: "Skilled",
      employmentType: "CONTRACTUAL",
      exitDate: null,
      exitReason: "",
      serviceBookNo: "",
      branchLocation: "AHMEDABAD",
      aadhaar: "123456789012",
      pan: "ABCDE1234F",
      pfNumber: "",
      uan: "",
      esiNumber: "",
      bankName: "State Bank of India",
      accountNumber: "1234567890",
      ifsc: "SBIN0001234",
      presentAddress: "123 Test St",
      permanentAddress: ""
    };
    const employee = await prisma.employee.create({ data });
    console.log("Created successfully!");
  } catch (err) {
    console.error("Failed:", err.message);
  }
}
run().finally(() => prisma.$disconnect());
