const fs = require('fs');
let schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');

const newModels = `
// ==========================================
// ARCHIVE & ENTERPRISE MODULES
// ==========================================

model ArchivedEmployee {
  id                     String   @id @default(uuid())
  employeeId             String   @unique
  employeeCode           String?
  fullName               String
  email                  String
  role                   String
  department             String
  companyId              String
  company                Company  @relation(fields: [companyId], references: [id])
  branchId               String?
  branch                 Branch?  @relation(fields: [branchId], references: [id])
  
  joiningDate            DateTime?
  offboardingDate        DateTime @default(now())
  offboardingReason      String?
  
  payrollCleared         Boolean  @default(false)
  documentsCleared       Boolean  @default(false)
  systemAccessRemoved    Boolean  @default(true)
  
  experienceSummary      String?
  previousCompanyHistory Json?
  
  createdAt              DateTime @default(now())
}

model ArchivedCompany {
  id                     String   @id @default(uuid())
  companyId              String   @unique
  companyName            String
  offboardingDate        DateTime @default(now())
  totalEmployeesArchived Int      @default(0)
  
  paymentStatus          String   @default("Pending")
  documentStatus         String   @default("Pending")
  archiveReason          String?
  
  createdAt              DateTime @default(now())
}

model EmployeeDocument {
  id                     String   @id @default(uuid())
  employeeId             String
  employee               Employee @relation(fields: [employeeId], references: [id])
  documentType           String
  fileUrl                String
  verificationStatus     String   @default("Pending") // "Pending", "Verified", "Rejected"
  uploadedAt             DateTime @default(now())
}

model CompanyDocument {
  id                     String   @id @default(uuid())
  companyId              String
  company                Company  @relation(fields: [companyId], references: [id])
  documentType           String
  fileUrl                String
  verificationStatus     String   @default("Pending") // "Pending", "Verified", "Rejected"
  uploadedAt             DateTime @default(now())
}

model Leave {
  id                     String   @id @default(uuid())
  employeeId             String
  employee               Employee @relation(fields: [employeeId], references: [id])
  leaveType              String   // "Sick", "Casual", "Annual"
  startDate              DateTime
  endDate                DateTime
  status                 String   @default("Pending") // "Pending", "Approved", "Rejected"
  reason                 String?
  createdAt              DateTime @default(now())
}

model ActivityTimeline {
  id                     String   @id @default(uuid())
  actorId                String?
  actorName              String?
  action                 String   // "Offboarded", "Created", "Exported"
  entityType             String   // "Employee", "Company"
  entityId               String
  details                String?
  timestamp              DateTime @default(now())
}
`;

if (!schema.includes('ArchivedEmployee')) {
  fs.writeFileSync('backend/prisma/schema.prisma', schema + newModels);
}

// Add relationships to Company
const companyRegex = /branches\s+Branch\[\]\s+employees\s+Employee\[\]\s+\}/;
if (schema.match(companyRegex)) {
  const newCompanyRels = `branches             Branch[]
  employees            Employee[]
  archivedEmployees    ArchivedEmployee[]
  documents            CompanyDocument[]
}`;
  let newSchema = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');
  newSchema = newSchema.replace(companyRegex, newCompanyRels);
  fs.writeFileSync('backend/prisma/schema.prisma', newSchema);
}

// Add relationships to Employee
const employeeRegex = /payroll\s+Payroll\[\]\s+attendance\s+Attendance\[\]\s+\}/;
if (schema.match(employeeRegex)) {
  const newEmpRels = `payroll              Payroll[]
  attendance           Attendance[]
  documents            EmployeeDocument[]
  leaves               Leave[]
}`;
  let newSchema2 = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');
  newSchema2 = newSchema2.replace(employeeRegex, newEmpRels);
  fs.writeFileSync('backend/prisma/schema.prisma', newSchema2);
}

// Add relationships to Branch
const branchRegex = /employees\s+Employee\[\]\s+\}/;
if (schema.match(branchRegex)) {
  const newBranchRels = `employees            Employee[]
  archivedEmployees    ArchivedEmployee[]
}`;
  let newSchema3 = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');
  newSchema3 = newSchema3.replace(branchRegex, newBranchRels);
  fs.writeFileSync('backend/prisma/schema.prisma', newSchema3);
}

console.log('Schema updated successfully');
