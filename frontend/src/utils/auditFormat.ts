/**
 * auditFormat — PRESENTATION-ONLY translation of raw audit rows into a
 * human-readable Activity Timeline. NOTHING here touches the backend, the API,
 * the audit schema or how logs are stored: it takes the exact rows the existing
 * GET /api/audit already returns and turns their technical `details` JSON into
 * meaningful text, field-by-field diffs, icons, tones and date groupings.
 *
 * The `details` payload is heterogeneous (the global Prisma audit middleware
 * writes `{by, role, op}`; individual controllers write richer shapes such as
 * `{from, to}`, `{file, total, imported, skipped}`, `{employeeName, date}`), so
 * every function here is defensive and falls back gracefully — a shape we don't
 * recognise is still rendered as clean label/value pairs, never as raw braces.
 */

export interface AuditEntry {
  id: number;
  action: string;
  module: string;
  targetId: string;
  details?: string | null;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

export type Tone = 'green' | 'blue' | 'red' | 'orange' | 'purple' | 'gray' | 'teal';
export type IconKey =
  | 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'import' | 'export'
  | 'payroll' | 'attendance' | 'leave' | 'settings' | 'permission' | 'login' | 'logout'
  | 'approve' | 'info';

export interface DetailRow { label: string; value: string; mono?: boolean; }
export interface FieldDiff { field: string; oldValue: string; newValue: string; oldEmpty: boolean; newEmpty: boolean; }

export interface AuditView {
  iconKey: IconKey;
  emoji: string;         // business feed icon (👤 💰 📄 …)
  tone: Tone;
  title: string;         // business-language headline ("Company Branding Updated")
  moduleLabel: string;   // business module name ("Company Settings")
  narrative: string;     // one-sentence plain-English summary
  subject?: string;
  changeBullets: string[]; // "Changes made" list (human field names)
  rows: DetailRow[];
  diffs: FieldDiff[];
  categories: string[];  // for the filter chips
}

// ── key / value humanisation ────────────────────────────────────────────────
const KEY_LABELS: Record<string, string> = {
  by: 'Performed By', role: 'Role', op: 'Operation', file: 'File', fileName: 'File',
  total: 'Total Rows', imported: 'Records Imported', updated: 'Records Updated',
  skipped: 'Skipped', errors: 'Errors', duplicates: 'Duplicates',
  overtimeQueued: 'Overtime Queued', records: 'Records', recordsImported: 'Records Imported',
  employeeName: 'Employee', employeeId: 'Employee ID', employeeCode: 'Employee Code',
  department: 'Department', designation: 'Designation', date: 'Date', month: 'Month', year: 'Year',
  source: 'Source', reason: 'Reason', from: 'From', to: 'To', status: 'Status',
  payrollRecalcRequired: 'Payroll Recalc Needed', duration: 'Duration', count: 'Count',
  name: 'Name', title: 'Title', amount: 'Amount', netSalary: 'Net Salary', basicSalary: 'Basic Salary',
  companyId: 'Company', branchId: 'Branch', leaveType: 'Leave Type', days: 'Days',
  uan: 'UAN', pan: 'PAN', ifsc: 'IFSC', esic: 'ESIC', gst: 'GST', dob: 'Date of Birth',
  otHours: 'OT Hours', payableDays: 'Payable Days', lopDays: 'LOP Days',
};

// Keys that are internal plumbing — never surfaced to HR users as rows.
const HIDDEN_KEYS = new Set(['op', 'role', 'companyId', 'branchId', 'id', 'targetId', 'payrollRecalcRequired']);
// Keys already represented elsewhere (the change bullets / subject) — skip as rows.
const BULLET_META_KEYS = new Set(['fields', 'changedFields', 'logoChanged', 'nameChangedTo']);

// Business-friendly names for the field keys that appear in `details.fields`
// (branding / company edits). Anything unmapped falls back to humanizeKey.
const FIELD_BUSINESS: Record<string, string> = {
  logoImage: 'Company Logo', logo: 'Company Logo', name: 'Company Name', displayName: 'Display Name',
  gstNumber: 'GST Number', gst: 'GST Number', gstDetails: 'GST Details', pan: 'PAN', cin: 'CIN Number',
  tan: 'TAN', msmeNumber: 'MSME Registration', website: 'Website', contactNumber: 'Contact Number',
  phone: 'Contact Number', email: 'Email', supportEmail: 'Support Email', hrEmail: 'HR Email',
  payrollEmail: 'Payroll Email', address: 'Address', registeredOfficeAddress: 'Registered Address',
  headOfficeAddress: 'Head Office Address', googleMapLocation: 'Map Location', letterheadImage: 'Letterhead',
  dscImage: 'Digital Signature', primaryColor: 'Brand Colour', motto: 'Motto', watermarkText: 'Watermark',
  bankName: 'Bank Name', accountNumber: 'Account Number', ifsc: 'IFSC Code',
};
const fieldBusinessLabel = (key: string): string => FIELD_BUSINESS[key] || humanizeKey(key);

// Business feed emoji per module / activity kind (the enterprise icon set).
const MODULE_EMOJI: Array<[RegExp, string]> = [
  [/brand/i, '🎨'], [/employee|staff|contact/i, '👤'], [/attendance/i, '📅'], [/payroll|salary|bonus/i, '💰'],
  [/invoice|billing/i, '📄'], [/company|companies|branch/i, '🏢'], [/report/i, '📊'],
  [/communication|whatsapp|announcement|message/i, '📨'], [/leave/i, '🌴'], [/setting|config|department/i, '⚙️'],
  [/finance|payment|loan/i, '💳'], [/complian/i, '🛡️'], [/document/i, '📁'],
];
const ICON_EMOJI: Partial<Record<IconKey, string>> = {
  login: '🔑', logout: '🚪', permission: '🛡️', import: '📥', export: '📤',
  delete: '🗑️', archive: '🗄️', restore: '♻️', approve: '✅',
};
function emojiFor(module: string, iconKey: IconKey): string {
  for (const [re, e] of MODULE_EMOJI) if (re.test(module)) return e;
  return ICON_EMOJI[iconKey] || (iconKey === 'create' ? '✅' : iconKey === 'update' ? '✏️' : '📌');
}

// Keys whose value should be rendered as Indian-rupee currency.
const CURRENCY_HINT = /(salary|amount|ctc|basic|hra|allowance|deduction|\bnet\b|gross|\bpay\b|wage|bonus|emi|principal|installment|lop|advance)/i;
// Keys whose value is a date/timestamp.
const DATE_HINT = /(date|_at|on$|createdAt|updatedAt|joindate|exitdate|effective)/i;

export function humanizeKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function prettyDate(v: any): string {
  const s = String(v);
  const md = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (md) { const mi = +md[2] - 1; return mi >= 0 && mi < 12 ? `${md[3]} ${MONTHS[mi]} ${md[1]}` : s; }
  const d = new Date(v);
  return isNaN(d.getTime()) ? s : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function humanizeValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    // Small nested object — flatten to "a: x, b: y" rather than dumping JSON.
    try { return Object.entries(value).map(([k, v]) => `${humanizeKey(k)}: ${humanizeValue(k, v)}`).join(', '); }
    catch { return ''; }
  }
  if (CURRENCY_HINT.test(key) && isFinite(Number(value)) && String(value).trim() !== '') {
    return `₹${Number(value).toLocaleString('en-IN')}`;
  }
  if (DATE_HINT.test(key)) return prettyDate(value);
  return String(value);
}

// ── details parsing ─────────────────────────────────────────────────────────
export function parseDetails(details?: string | null): Record<string, any> {
  if (!details) return {};
  if (typeof details === 'object') return details as any;
  try { const o = JSON.parse(details); return o && typeof o === 'object' ? o : { note: String(details) }; }
  catch { return { note: String(details) }; }
}

// A value that itself carries old/new — {old,new} | {from,to} | {before,after}.
function asChange(v: any): { oldV: any; newV: any } | null {
  if (!v || typeof v !== 'object') return null;
  if ('old' in v || 'new' in v) return { oldV: v.old, newV: v.new };
  if ('from' in v || 'to' in v) return { oldV: v.from, newV: v.to };
  if ('before' in v || 'after' in v) return { oldV: v.before, newV: v.after };
  return null;
}

function toDiff(field: string, oldV: any, newV: any): FieldDiff {
  const oldStr = humanizeValue(field, oldV);
  const newStr = humanizeValue(field, newV);
  return { field: humanizeKey(field), oldValue: oldStr, newValue: newStr, oldEmpty: oldStr === '', newEmpty: newStr === '' };
}

// Build the field-level diffs from whatever change shape the details carry.
export function extractDiffs(details: Record<string, any>): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  // 1. explicit `changes: { field: {old,new|from,to} }`
  const changes = details.changes && typeof details.changes === 'object' ? details.changes : null;
  if (changes) {
    for (const [field, v] of Object.entries(changes)) {
      const c = asChange(v);
      if (c) diffs.push(toDiff(field, c.oldV, c.newV));
      else diffs.push(toDiff(field, undefined, v));
    }
  }
  // 2. before/after object pair → diff the keys that differ
  const before = details.before && typeof details.before === 'object' ? details.before : null;
  const after = details.after && typeof details.after === 'object' ? details.after : null;
  if (before || after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const k of keys) {
      const o = before ? before[k] : undefined;
      const n = after ? after[k] : undefined;
      if (JSON.stringify(o) !== JSON.stringify(n)) diffs.push(toDiff(k, o, n));
    }
  }
  // 3. any top-level value that is itself a {old,new}/{from,to} change (but NOT a
  //    bare top-level from/to pair — that is handled as the record's own status).
  for (const [k, v] of Object.entries(details)) {
    if (k === 'changes' || k === 'before' || k === 'after' || k === 'from' || k === 'to') continue;
    const c = asChange(v);
    if (c) diffs.push(toDiff(k, c.oldV, c.newV));
  }
  // 4. bare top-level `from`/`to` (attendance status correction, etc.)
  if (('from' in details || 'to' in details) && (details.from !== undefined || details.to !== undefined)) {
    diffs.push(toDiff('status', details.from, details.to));
  }
  return diffs;
}

// ── action → icon / tone / verb ─────────────────────────────────────────────
const MODULE_LABELS: Record<string, string> = {
  Employee: 'Employee', Payroll: 'Payroll', Attendance: 'Attendance', Company: 'Company',
  Companies: 'Company', Branding: 'Company Branding', Branch: 'Branch', Document: 'Document',
  User: 'User', Task: 'Task', LeaveRequest: 'Leave', CompanyContact: 'Company Contact',
  Department: 'Department', Invoice: 'Invoice', Loan: 'Loan',
  LeaveBalance: 'Leave Balance', Shift: 'Shift', Overtime: 'Overtime',
  CommunicationHoliday: 'Holiday', CompanyPayroll: 'Company Payroll', BranchPayroll: 'Branch Payroll',
  ComplianceRecord: 'Compliance', ComplianceFiling: 'Compliance', WhatsAppSettings: 'WhatsApp Settings',
};

// The business AREA a module belongs to — shown as "Affected Module" when expanded.
function areaLabel(module: string): string {
  const m = module || '';
  if (/brand|compan|branch|contact/i.test(m)) return 'Company Settings';
  if (/employee|staff/i.test(m)) return 'Employee Management';
  if (/payroll|salary|bonus/i.test(m)) return 'Payroll';
  if (/attendance|overtime|shift/i.test(m)) return 'Attendance';
  if (/leave/i.test(m)) return 'Leave Management';
  if (/document/i.test(m)) return 'Documents';
  if (/invoice|billing/i.test(m)) return 'Invoicing';
  if (/communication|whatsapp/i.test(m)) return 'Communication';
  if (/complian/i.test(m)) return 'Compliance';
  if (/setting|config|department/i.test(m)) return 'Settings';
  if (/loan|payment|finance/i.test(m)) return 'Finance';
  return module ? humanizeKey(module) : 'System';
}

const VERB_PAST: Record<string, string> = {
  CREATE: 'Created', UPDATE: 'Updated', UPSERT: 'Saved', DELETE: 'Deleted',
  IMPORT: 'Imported', EXPORT: 'Exported', MARK: 'Marked', CORRECT: 'Corrected',
  APPROVE: 'Approved', REJECT: 'Rejected', ARCHIVE: 'Archived', RESTORE: 'Restored',
  GENERATE: 'Generated', LOCK: 'Locked', UNLOCK: 'Unlocked', PAID: 'Paid', ASSIGN: 'Assigned',
};

function moduleLabel(module: string, entityFromAction: string): string {
  if (module && MODULE_LABELS[module]) return MODULE_LABELS[module];
  if (module) return humanizeKey(module);
  if (entityFromAction) return humanizeKey(entityFromAction.toLowerCase());
  return 'Record';
}

/** The full presentation model for one audit row. Pure — no JSX, no DOM. */
export function describeAudit(entry: AuditEntry): AuditView {
  const details = parseDetails(entry.details);
  const rawAction = String(entry.action || '').toUpperCase();
  const us = rawAction.indexOf('_');
  const verb = us >= 0 ? rawAction.slice(0, us) : rawAction;
  const entity = us >= 0 ? rawAction.slice(us + 1) : '';
  const mod = moduleLabel(entry.module, entity);

  // icon + tone — special actions first, then module, then verb.
  let iconKey: IconKey = 'info';
  let tone: Tone = 'gray';
  const isPayroll = /PAYROLL/.test(rawAction) || /Payroll/i.test(entry.module);
  const isAttendance = /ATTENDANCE/.test(rawAction) || /Attendance/i.test(entry.module);
  const isLeave = /LEAVE/.test(rawAction) || /Leave/i.test(entry.module);

  if (verb === 'LOGIN' || rawAction.includes('LOGIN') || rawAction.includes('SIGN_IN')) { iconKey = 'login'; tone = 'blue'; }
  else if (verb === 'LOGOUT' || rawAction.includes('LOGOUT') || rawAction.includes('SIGN_OUT')) { iconKey = 'logout'; tone = 'gray'; }
  else if (rawAction.includes('PERMISSION') || rawAction.includes('ROLE') || rawAction.includes('ACCESS')) { iconKey = 'permission'; tone = 'purple'; }
  else if (verb === 'IMPORT') { iconKey = 'import'; tone = 'blue'; }
  else if (verb === 'EXPORT' || verb === 'DOWNLOAD') { iconKey = 'export'; tone = 'green'; }
  else if (verb === 'ARCHIVE') { iconKey = 'archive'; tone = 'orange'; }
  else if (verb === 'RESTORE') { iconKey = 'restore'; tone = 'purple'; }
  else if (verb === 'APPROVE' || verb === 'PAID') { iconKey = 'approve'; tone = 'green'; }
  else if (verb === 'CREATE') { iconKey = isPayroll ? 'payroll' : isAttendance ? 'attendance' : isLeave ? 'leave' : 'create'; tone = isPayroll ? 'purple' : 'green'; }
  else if (verb === 'DELETE') { iconKey = 'delete'; tone = 'red'; }
  else if (['UPDATE', 'UPSERT', 'MARK', 'CORRECT', 'GENERATE', 'LOCK', 'UNLOCK', 'ASSIGN'].includes(verb)) {
    iconKey = isPayroll ? 'payroll' : isAttendance ? 'attendance' : isLeave ? 'leave' : 'update';
    tone = isPayroll ? 'purple' : isAttendance ? 'green' : isLeave ? 'orange' : 'blue';
  } else if (/SETTING|CONFIG/.test(rawAction) || /Settings/i.test(entry.module)) { iconKey = 'settings'; tone = 'gray'; }
  else if (isPayroll) { iconKey = 'payroll'; tone = 'purple'; }
  else if (isAttendance) { iconKey = 'attendance'; tone = 'green'; }
  else if (isLeave) { iconKey = 'leave'; tone = 'orange'; }

  // Title — business language, never a raw event name.
  const verbPast = VERB_PAST[verb] || (verb ? humanizeKey(verb.toLowerCase()) : 'Activity');
  const isBranding = /brand/i.test(entry.module);
  const isCompany = /^compan/i.test(entry.module);
  const isInvoice = /invoice|billing/i.test(entry.module);
  const isEmployee = /employee|staff/i.test(entry.module);
  const actor = firstString(details.by, entry.actorName) || 'Someone';
  let title: string;
  if (iconKey === 'login') title = 'Signed In';
  else if (iconKey === 'logout') title = 'Signed Out';
  else if (verb === 'IMPORT' && isAttendance) title = 'Attendance Imported';
  else if (isPayroll) title = verb === 'CREATE' || verb === 'GENERATE' ? 'Payroll Generated' : 'Payroll Updated';
  else if (isBranding) title = 'Company Branding Updated';
  else if (isCompany) title = verb === 'CREATE' ? 'Company Created' : verb === 'DELETE' ? 'Company Removed' : 'Company Information Updated';
  else if (isEmployee) title = verb === 'CREATE' ? 'Employee Added' : verb === 'DELETE' ? 'Employee Removed' : 'Employee Updated';
  else if (isInvoice) title = verb === 'CREATE' ? 'Invoice Created' : `Invoice ${verbPast}`;
  else title = `${mod} ${verbPast}`;

  // Subject line — the human "what/who" this row is about.
  const subject =
    firstString(details.employeeName, details.name, details.title, details.file, details.fileName, details.invoiceNumber, details.customer)
    || (entry.targetId ? `Record #${entry.targetId}` : undefined);

  // Detail rows — every meaningful, non-plumbing key, humanised. Diff keys, bullet
  // keys and the subject key are omitted (shown elsewhere).
  const diffKeys = new Set(['changes', 'before', 'after', 'from', 'to']);
  const rows: DetailRow[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (HIDDEN_KEYS.has(k) || BULLET_META_KEYS.has(k) || diffKeys.has(k) || k === 'by') continue;
    if (k === 'employeeName' || k === 'name' || k === 'file' || k === 'fileName' || k === 'title' || k === 'invoiceNumber' || k === 'customer') continue; // in subject
    if (asChange(v)) continue; // rendered as a diff
    const value = humanizeValue(k, v);
    if (value === '') continue;
    rows.push({ label: humanizeKey(k), value, mono: /id|code|uan|pan|ifsc|gst|number/i.test(k) });
  }

  // "Changes made" bullets — prefer the explicit changed-field list, else the diffs.
  const fieldArr = Array.isArray(details.fields) ? details.fields
    : Array.isArray(details.changedFields) ? details.changedFields : null;
  let changeBullets: string[] = fieldArr
    ? fieldArr.map((f: any) => fieldBusinessLabel(String(f)))
    : [];
  changeBullets = Array.from(new Set(changeBullets)).slice(0, 10);

  // Narrative — one plain-English sentence a Company Head grasps in 2 seconds.
  const dept = firstString(details.department);
  const roleOrActor = firstString(entry.actorRole, details.by, entry.actorName) || 'a user';
  let narrative: string;
  if (isBranding) narrative = `${actor} updated the company branding.`;
  else if (isCompany && verb === 'CREATE') narrative = `A new company${subject ? ` — ${subject}` : ''} was created by ${roleOrActor}.`;
  else if (isCompany) narrative = `Company profile was updated by ${roleOrActor}.`;
  else if (isEmployee && verb === 'CREATE') narrative = `A new employee${subject ? ` ${subject}` : ''} joined${dept ? ` the ${dept} Department` : ''}.`;
  else if (isEmployee && verb === 'DELETE') narrative = `${subject || 'An employee'} was removed by ${actor}.`;
  else if (isEmployee) narrative = `${actor} updated ${subject ? `${subject}'s` : 'an employee'} profile.`;
  else if (iconKey === 'payroll') narrative = `${firstString(details.month) ? `${details.month}${details.year ? ' ' + details.year : ''} ` : ''}payroll ${verb === 'CREATE' || verb === 'GENERATE' ? 'generated successfully' : 'was updated'}.`;
  else if (verb === 'IMPORT' && isAttendance) narrative = 'Biometric synchronization completed.';
  else if (isInvoice && verb === 'CREATE') narrative = `Invoice${subject ? ` ${subject}` : ''} was created${firstString(details.customer) ? ` for ${details.customer}` : ''}.`;
  else if (iconKey === 'login') narrative = `${actor} signed in.`;
  else if (iconKey === 'logout') narrative = `${actor} signed out.`;
  else narrative = `${actor} ${verbPast.toLowerCase()} ${mod.toLowerCase()}${subject ? ` — ${subject}` : ''}.`;

  const diffs = extractDiffs(details);

  // Filter categories this row belongs to.
  const categories: string[] = [];
  const addCat = (c: string) => { if (!categories.includes(c)) categories.push(c); };
  if (verb === 'CREATE') addCat('Create');
  if (['UPDATE', 'UPSERT', 'MARK', 'CORRECT', 'GENERATE'].includes(verb)) addCat('Update');
  if (verb === 'DELETE') addCat('Delete');
  if (verb === 'IMPORT') addCat('Import');
  if (verb === 'EXPORT') addCat('Export');
  if (iconKey === 'login' || iconKey === 'logout') addCat('Login');
  if (isPayroll) addCat('Payroll');
  if (isAttendance) addCat('Attendance');
  if (iconKey === 'settings') addCat('Settings');
  if (isEmployee) addCat('Employees');
  if (/Company|Branding|Branch/i.test(entry.module)) addCat('Company');
  if (isInvoice) addCat('Invoices');
  if (/document/i.test(entry.module)) addCat('Documents');
  if (/communication|whatsapp/i.test(entry.module)) addCat('Communication');
  if (/loan|payment|finance/i.test(entry.module)) addCat('Finance');
  if (details.department || /Department/i.test(entry.module)) addCat('Department');

  return {
    iconKey, emoji: emojiFor(entry.module, iconKey), tone, title,
    moduleLabel: areaLabel(entry.module), narrative, subject, changeBullets, rows, diffs, categories,
  };
}

function firstString(...vals: any[]): string | undefined {
  for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); }
  return undefined;
}

// ── date grouping ─────────────────────────────────────────────────────────
export type DateBucket = 'Today' | 'Yesterday' | 'Last Week' | 'Last Month' | 'Older';
export const BUCKET_ORDER: DateBucket[] = ['Today', 'Yesterday', 'Last Week', 'Last Month', 'Older'];

/** Bucket a timestamp relative to `now` (defaults to the current time). */
export function dateBucket(iso: string, now: Date = new Date()): DateBucket {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Older';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86400000;
  const days = Math.floor((startOf(now) - startOf(d)) / dayMs);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Last Week';
  if (days <= 31) return 'Last Month';
  return 'Older';
}

// ── search / filter ──────────────────────────────────────────────────────
/** Free-text match across who / action / module / subject / detail values. */
export function matchesSearch(entry: AuditEntry, view: AuditView, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    entry.actorName, entry.actorRole, entry.module, entry.action.replace(/_/g, ' '),
    view.title, view.subject || '',
    ...view.rows.map((r) => `${r.label} ${r.value}`),
    ...view.diffs.map((d) => `${d.field} ${d.oldValue} ${d.newValue}`),
  ].join(' ').toLowerCase();
  return hay.includes(needle);
}

export const FILTER_CATEGORIES = [
  'All', 'Create', 'Update', 'Delete', 'Import', 'Export',
  'Payroll', 'Attendance', 'Settings', 'Login', 'Company', 'Department',
] as const;

// Business-feed filter chips (the Recent Activities card).
export const FEED_FILTERS = [
  'All', 'Employees', 'Attendance', 'Payroll', 'Invoices',
  'Settings', 'Finance', 'Documents', 'Company', 'Communication',
] as const;

// ── relative "human" time ────────────────────────────────────────────────────
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Just now" / "5 minutes ago" / "Today" / "Yesterday" / "Monday" / "Last Week". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOf(now) - startOf(d)) / 86400000);
  const hours = Math.floor(sec / 3600);
  if (days <= 0) return hours < 6 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 6) return WEEKDAYS[d.getDay()];
  if (days <= 13) return 'Last Week';
  return prettyDate(iso);
}

// ── summary + AI digest for the top of the feed ──────────────────────────────
export interface ActivitySummary { today: number; employeeUpdates: number; payroll: number; attendance: number; invoices: number; }

const numFrom = (...vals: any[]): number => { for (const v of vals) { const n = Number(v); if (isFinite(n) && v !== undefined && v !== null && v !== '') return n; } return 0; };

/** Counts for the summary strip, computed over TODAY's activities. */
export function activitySummary(entries: AuditEntry[], now: Date = new Date()): ActivitySummary {
  const s: ActivitySummary = { today: 0, employeeUpdates: 0, payroll: 0, attendance: 0, invoices: 0 };
  for (const e of entries) {
    if (dateBucket(e.createdAt, now) !== 'Today') continue;
    s.today++;
    const v = describeAudit(e);
    if (v.categories.includes('Employees')) s.employeeUpdates++;
    if (v.categories.includes('Payroll')) s.payroll++;
    if (v.categories.includes('Attendance')) s.attendance++;
    if (v.categories.includes('Invoices')) s.invoices++;
  }
  return s;
}

/** Plain-English "Today's Summary" bullets — only the lines that actually happened. */
export function aiSummary(entries: AuditEntry[], now: Date = new Date()): string[] {
  let empAdded = 0, empUpdated = 0, payroll = 0, attSynced = 0, invoices = 0, compliance = 0;
  for (const e of entries) {
    if (dateBucket(e.createdAt, now) !== 'Today') continue;
    const a = String(e.action || '').toUpperCase();
    const m = e.module || '';
    const d = parseDetails(e.details);
    if (/employee|staff/i.test(m)) { if (a.startsWith('CREATE')) empAdded++; else if (/UPDATE|UPSERT/.test(a)) empUpdated++; }
    if (/payroll/i.test(m) || /PAYROLL/.test(a)) payroll++;
    if (/attendance/i.test(m) && /IMPORT/.test(a)) attSynced += numFrom(d.imported, d.records, d.recordsImported, d.total);
    if (/invoice|billing/i.test(m) && a.startsWith('CREATE')) invoices++;
    if (/complian/i.test(m)) compliance++;
  }
  const out: string[] = [];
  const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`;
  if (empAdded) out.push(`${plural(empAdded, 'employee')} added`);
  if (empUpdated) out.push(`${plural(empUpdated, 'employee profile')} updated`);
  if (payroll) out.push(payroll === 1 ? 'Payroll generated' : `${payroll} payrolls generated`);
  if (attSynced) out.push(`${attSynced.toLocaleString('en-IN')} attendance records synced`);
  if (invoices) out.push(`${plural(invoices, 'invoice')} created`);
  if (compliance) out.push(`${plural(compliance, 'compliance update')}`);
  return out;
}
