import os
import re

files_to_patch = [
    'src/pages/Employees.tsx',
    'src/pages/Attendance.tsx',
    'src/pages/Dashboard.tsx',
    'src/pages/Documents.tsx',
    'src/pages/Payroll.tsx',
    'src/pages/Reports.tsx',
    'src/pages/Leaves.tsx'
]

# 1. First, standardise all calls to isCompanyIdMatch for employees
for filepath in files_to_patch:
    if not os.path.exists(filepath): continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace: isCompanyIdMatch(e.companyId, activeCompanyId, companies, (e as any).branchId)
    # with: isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation)
    # Note: e might be emp or a or p, but they don't all have branchLocation. Only employee records have branchLocation.
    # Actually, let's just do a blanket replacement for the 4th arg if it exists for employees
    content = re.sub(r'isCompanyIdMatch\(([^,]+)\.companyId,\s*activeCompanyId,\s*([^,]+),\s*\(\1 as any\)\.branchId\)', r'isCompanyIdMatch(\1.companyId, activeCompanyId, \2, \1.branchLocation)', content)
    content = re.sub(r'isCompanyIdMatch\(([^,]+)\.companyId,\s*activeCompanyId,\s*undefined,\s*\(\1 as any\)\.branchId\)', r'isCompanyIdMatch(\1.companyId, activeCompanyId, undefined, \1.branchLocation)', content)
    
    # In Employees.tsx, it doesn't even pass the 4th argument currently!
    # e.g. isCompanyIdMatch(e.companyId, activeCompanyId, companies)
    if 'Employees.tsx' in filepath:
        content = re.sub(r'isCompanyIdMatch\(([^,]+)\.companyId,\s*activeCompanyId,\s*companies\)', r'isCompanyIdMatch(\1.companyId, activeCompanyId, companies, \1.branchLocation)', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Patched {filepath}")

# 2. Patch isCompanyIdMatch logic in src/types/index.ts
types_path = 'src/types/index.ts'
with open(types_path, 'r', encoding='utf-8') as f:
    types_content = f.read()

new_logic = """export const isCompanyIdMatch = (recordCompanyId: string, activeId: string, companiesList?: Company[], recordBranchLocation?: string): boolean => {
  if (recordCompanyId === activeId) return true;
  if (!companiesList || companiesList.length === 0) return false;
  
  const activeComp = companiesList.find(c => c.id === activeId);
  
  // Branch mode: If active is a branch (has parentCompanyId and not head office)
  if (activeComp && activeComp.parentCompanyId && !activeComp.isHeadOffice) {
     // Record must belong to the parent company
     if (recordCompanyId === activeComp.parentCompanyId && recordBranchLocation) {
       const activeBranchName = (activeComp.name || activeComp.branchName || '').toUpperCase();
       if (recordBranchLocation.toUpperCase() === activeBranchName) return true;
     }
     return false;
  }
  
  // Parent mode: active is a head office
  if (activeComp && (!activeComp.parentCompanyId || activeComp.isHeadOffice)) {
    const recordComp = companiesList.find(c => c.id === recordCompanyId);
    return recordCompanyId === activeId || recordComp?.parentCompanyId === activeComp.id;
  }
  
  return false;
};"""

types_content = re.sub(r'export const isCompanyIdMatch = .*?};', new_logic, types_content, flags=re.DOTALL)

with open(types_path, 'w', encoding='utf-8') as f:
    f.write(types_content)
print(f"Patched {types_path}")

