import re

# 1. Update src/types/index.ts
with open('src/types/index.ts', 'r', encoding='utf-8') as f:
    types_content = f.read()

types_old = """export const isCompanyIdMatch = (recordCompanyId: string, activeId: string, companiesList?: Company[], recordBranchLocation?: string, recordEmployeeBranchId?: string): boolean => {
  if (recordCompanyId === activeId) return true;
  if (!companiesList || companiesList.length === 0) return false;"""

types_new = """export const isCompanyIdMatch = (recordCompanyId: string, activeId: string, companiesList?: Company[], recordBranchLocation?: string, recordEmployeeBranchId?: string): boolean => {
  if (recordCompanyId === activeId) return true;
  
  let list = companiesList;
  if (!list || list.length === 0) {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('hrms_companies');
      if (raw) {
        try { list = JSON.parse(raw); } catch (e) {}
      }
    }
  }
  if (!list || list.length === 0) return false;"""

if types_old in types_content:
    types_content = types_content.replace(types_old, types_new)
    with open('src/types/index.ts', 'w', encoding='utf-8') as f:
        f.write(types_content)
else:
    print("Failed to patch src/types/index.ts")

# 2. Update Payroll.tsx imports
with open('src/pages/Payroll.tsx', 'r', encoding='utf-8') as f:
    payroll_content = f.read()

payroll_import_old = """  type PayrollStatus,
  isCompanyIdMatch
} from '../data/mockData';"""

payroll_import_new = """  type PayrollStatus
} from '../data/mockData';
import { isCompanyIdMatch } from '../types';"""

if payroll_import_old in payroll_content:
    payroll_content = payroll_content.replace(payroll_import_old, payroll_import_new)
    with open('src/pages/Payroll.tsx', 'w', encoding='utf-8') as f:
        f.write(payroll_content)
else:
    print("Failed to patch Payroll.tsx import")

# 3. Update Documents.tsx filtering
with open('src/pages/Documents.tsx', 'r', encoding='utf-8') as f:
    docs_content = f.read()

docs_filter_old = """  const uniqueDocuments = getUniqueRecords(documents, [d => d.id]); // Documents have unique IDs but might be duplicated in state
  const list = uniqueDocuments.filter(d => isCompanyIdMatch(d.companyId, activeCompanyId));"""

docs_filter_new = """  const uniqueDocuments = getUniqueRecords(documents, [d => d.id]); // Documents have unique IDs but might be duplicated in state
  const list = uniqueDocuments.filter(d => {
    const emp = uniqueEmployees.find(e => e.id === d.employeeId || e.employeeId === d.employeeId);
    return isCompanyIdMatch(d.companyId, activeCompanyId, companies, emp?.branchLocation, emp?.branchId);
  });"""

if docs_filter_old in docs_content:
    docs_content = docs_content.replace(docs_filter_old, docs_filter_new)
    with open('src/pages/Documents.tsx', 'w', encoding='utf-8') as f:
        f.write(docs_content)
else:
    print("Failed to patch Documents.tsx filtering")

print("Patching complete.")
