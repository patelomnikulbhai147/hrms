/**
 * Canonical employee ordering used across every module (Employees, Payroll,
 * Attendance, Leave, Reports, Salary Slips, Exports).
 *
 * Employee codes look like  VE-AHMD-0001 / VE-BHAV-0012  — i.e.
 *   <COMPANY>-<BRANCH>-<SEQUENCE>.
 * Sorting by (alphabetical prefix, then NUMERIC sequence) therefore yields the
 * required order:  Company → Branch → Employee ID ascending, with the numeric
 * part compared as a number (0002 before 0012, never lexicographically).
 */

function parseCode(code: any): { prefix: string; num: number; raw: string } {
  const raw = String(code == null ? '' : code).trim();
  const m = /^(.*?)(\d+)\s*$/.exec(raw); // greedy prefix + trailing digits
  return m ? { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10), raw } : { prefix: raw.toUpperCase(), num: -1, raw };
}

/** Compare two employee CODE strings (e.g. "VE-BHAV-0004" vs "VE-BHAV-0012"). */
export function compareEmployeeCode(a: any, b: any): number {
  const pa = parseCode(a);
  const pb = parseCode(b);
  if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.raw.localeCompare(pb.raw);
}

/** Sort comparator for objects, given a function that returns the employee code. */
export function byEmployeeCode<T>(getCode: (item: T) => any): (a: T, b: T) => number {
  return (a, b) => compareEmployeeCode(getCode(a), getCode(b));
}

/** Return a new array sorted by employee code (does not mutate the input). */
export function sortByEmployeeCode<T>(items: T[], getCode: (item: T) => any): T[] {
  return [...items].sort(byEmployeeCode(getCode));
}
