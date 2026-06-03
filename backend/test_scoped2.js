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
  const uniquePayroll = getUniqueRecords(payroll, [p => `${p.employeeId}-${p.month}-${p.year}`]);
  
  const allSid = uniquePayroll.filter(p => p.employee && p.employee.branchId === 'c-siddhpur');
  console.log("allSid length:", allSid.length);
  
  for (const s of allSid) {
    const emp = s.employee || uniqueEmployees.find(e => e.id === s.employeeId || e.employeeId === s.employeeId);
    const match = isCompanyIdMatch(s.companyId, activeCompanyId, companies, emp?.branchLocation, emp?.branchId);
    console.log(`id: ${s.id}, branchLoc: ${emp?.branchLocation}, branchId: ${emp?.branchId}, MATCH: ${match}`);
  }
  
  await prisma.$disconnect();
}
run();
