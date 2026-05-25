import { Employee } from '../data/mockData';

/**
 * Ensures that an array of employees only contains unique records based on employeeId globally.
 * Uses the first encountered occurrence of an employee.
 */
export const getUniqueEmployees = (employees: Employee[]): Employee[] => {
  if (!employees) return [];
  const uniqueEmployees: Employee[] = [];
  const seen = new Set<string>();
  
  for (const emp of employees) {
    // If employeeId is missing, fallback to id, then email
    const key = (emp.employeeId || emp.id || emp.email || '').toString().toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueEmployees.push(emp);
    }
  }
  
  return uniqueEmployees;
};

/**
 * Generic unique filter for any array of objects based on a specific key or fallback keys
 */
export const getUniqueRecords = <T>(records: T[], keyExtractors: ((record: T) => string | undefined)[]): T[] => {
  if (!records) return [];
  const uniqueRecords: T[] = [];
  const seen = new Set<string>();
  
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
    } else if (!key) {
      // If we can't extract a valid key, we just pass it through to avoid dropping un-keyable records
      uniqueRecords.push(record);
    }
  }
  
  return uniqueRecords;
};
