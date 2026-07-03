// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Placeholder Engine (Phase 1 — prepared, NOT rendered over WhatsApp).
//
// Resolves the supported {{tokens}} in a template body/caption against an
// employee + company context. This is the SAME token vocabulary the rest of the
// Communication Center uses, scoped here to the 8 tokens the WhatsApp spec
// requires. In Phase 2 the WhatsAppService feeds the rendered string to the Meta
// Cloud API; in Phase 1 it is only used to build the stored payload snapshot and
// the "Test Configuration" simulation — nothing is transmitted.
// ─────────────────────────────────────────────────────────────────────────────

// Self-contained "DD Mon YYYY" formatter (Asia/Kolkata) so the engine has no
// cross-module dependency and never throws on bad input.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// The placeholder vocabulary supported for WhatsApp messages.
const WHATSAPP_PLACEHOLDERS = [
  { token: '{{employee_name}}', label: 'Employee Name', sample: 'Raj Sharma' },
  { token: '{{company_name}}', label: 'Company Name', sample: 'Vishv Enterprise' },
  { token: '{{designation}}', label: 'Designation', sample: 'Software Developer' },
  { token: '{{department}}', label: 'Department', sample: 'Engineering' },
  { token: '{{employee_photo}}', label: 'Employee Photo', sample: '[employee photo]' },
  { token: '{{company_logo}}', label: 'Company Logo', sample: '[company logo]' },
  { token: '{{joining_date}}', label: 'Joining Date', sample: '01 Jun 2022' },
  { token: '{{today_date}}', label: "Today's Date", sample: 'today' },
  { token: '{{employee_id}}', label: 'Employee ID', sample: 'EMP-1024' },
  { token: '{{branch_name}}', label: 'Branch Name', sample: 'Head Office' },
];

// Best-effort date formatting that never throws (formatDate handles bad input,
// but guard anyway so the engine is pure and safe).
const safeDate = (value) => {
  try {
    if (!value) return '';
    return formatDate(value);
  } catch {
    return '';
  }
};

// Build the token → value map for a given employee + company.
// Both are plain objects; any missing field resolves to '' (never undefined),
// so a half-populated record never leaks a literal {{token}}.
const buildContext = (employee = {}, company = {}) => {
  const emp = employee || {};
  const co = company || {};
  return {
    employee_name: emp.name || emp.fullName || emp.employeeName || '',
    designation: emp.designation || emp.role || '',
    department: emp.department || '',
    employee_photo: emp.photo || emp.photoUrl || emp.profilePhoto || '',
    company_name: co.displayName || co.tradeName || co.name || co.legalName || '',
    company_logo: co.logoImage || co.logo || '',
    joining_date: safeDate(emp.joinDate || emp.joiningDate || emp.dateOfJoining),
    today_date: safeDate(new Date()),
    employee_id: emp.employeeId || emp.empId || emp.code || '',
    branch_name: emp.branchName || (emp.branch && (emp.branch.name || emp.branch.branchName)) || '',
  };
};

// Replace every {{token}} in `text` with the resolved value. Unknown tokens are
// left untouched (so authoring mistakes are visible, not silently dropped).
const render = (text, employee, company) => {
  if (!text) return '';
  const ctx = buildContext(employee, company);
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(ctx, key) ? (ctx[key] || '') : match
  );
};

// Same as render() but uses the documented SAMPLE values — used by the preview /
// test simulation so the UI shows realistic output without any real employee.
const renderSample = (text) => {
  if (!text) return '';
  const map = {};
  WHATSAPP_PLACEHOLDERS.forEach((p) => {
    map[p.token.replace(/\{\{|\}\}/g, '')] = p.sample;
  });
  map.today_date = safeDate(new Date());
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : match
  );
};

module.exports = {
  WHATSAPP_PLACEHOLDERS,
  buildContext,
  render,
  renderSample,
};
