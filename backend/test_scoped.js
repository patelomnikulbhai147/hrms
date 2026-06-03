const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getUniqueRecords(records, keyExtractors) {
  if (!records) return [];
  const uniqueRecords = [];
  const seen = new Set();
  
  for (const record of records) {
    let key = '';
    for (const extractor of keyExtractors) {
      const val = extractor(record);
      if (val) {
        key = val.toString().toLowerCase().trim();
        break;
      }
    }
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueRecords.push(record);
    }
  }
  return uniqueRecords;
}

const isCompanyIdMatch = (recordCompanyId, activeId, companiesList, recordBranchLocation, recordEmployeeBranchId) => {
  if (recordCompanyId === activeId) return true;
  
  let list = companiesList;
  if (!list || list.length === 0) return false;
  
  const activeComp = companiesList.find(c => c.id === activeId);
  
  if (activeComp && activeComp.parentCompanyId && !activeComp.isHeadOffice) {
     if (recordEmployeeBranchId && recordEmployeeBranchId === activeId) return true;
     
     if (recordCompanyId === activeComp.parentCompanyId && recordBranchLocation) {
       const activeBranchName = (activeComp.name || activeComp.branchName || '').toUpperCase().trim();
       if (recordBranchLocation.toUpperCase().trim() === activeBranchName) return true;
     }
     return false;
  }
  
  if (activeComp && (!activeComp.parentCompanyId || activeComp.isHeadOffice)) {
    const recordComp = companiesList.find(c => c.id === recordCompanyId);
    return recordCompanyId === activeId || recordComp?.parentCompanyId === activeComp.id;
  }
  
  return false;
};

async function run() {
  const allowedIds = ['c-gcri', 'c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur'];
  const payroll = await prisma.payroll.findMany({
    where: {
      OR: [
        { companyId: { in: allowedIds } },
        { employee: { branchId: { in: allowedIds } } },
        { employee: { companyId: { in: allowedIds } } }
      ]
    },
    include: { employee: true }
  });
  
  const uniqueEmployees = await prisma.employee.findMany();
  const companies = await prisma.company.findMany();
  
  const activeCompanyId = 'c-siddhpur';
  const role = 'HR';
  const authProfile = null;
  
  const uniquePayroll = getUniqueRecords(payroll, [p => `${p.employeeId}-${p.month}-${p.year}`]);
  
  const scopedRecords = uniquePayroll.filter(p => {
    const emp = p.employee || uniqueEmployees.find(e => e.id === p.employeeId || e.employeeId === p.employeeId);
    return isCompanyIdMatch(p.companyId, activeCompanyId, companies, emp?.branchLocation, emp?.branchId);
  });
  
  console.log('uniquePayroll length:', uniquePayroll.length);
  console.log('scopedRecords length:', scopedRecords.length);
  
  if (scopedRecords.length === 0) {
      console.log("SCOPED RECORDS IS 0!");
      // test first siddhpur record
      const sid = uniquePayroll.find(p => p.employee && p.employee.branchId === 'c-siddhpur');
      if (sid) {
          const emp = sid.employee;
          console.log("Sid record:", sid.companyId, activeCompanyId, emp.branchLocation, emp.branchId);
          console.log("Match:", isCompanyIdMatch(sid.companyId, activeCompanyId, companies, emp.branchLocation, emp.branchId));
      } else {
          console.log("NO SID RECORD FOUND IN UNIQUE PAYROLL");
          console.log("Total sid records before unique:", payroll.filter(p => p.employee && p.employee.branchId === 'c-siddhpur').length);
      }
  }

  await prisma.$disconnect();
}
run();
