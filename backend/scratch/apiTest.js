const BASE = 'http://localhost:5000';
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
(async () => {
  // 1) login as super admin
  const login = await j('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@platform.in', password: 'newadminpass' }),
  });
  console.log('LOGIN status:', login.status, '| token?', !!(login.body && (login.body.token || login.body.accessToken)));
  const token = login.body.token || login.body.accessToken || (login.body.data && login.body.data.token);
  const H = { headers: { Authorization: 'Bearer ' + token } };

  // 2) super admin stats
  const stats = await j('/api/statistics/super-admin', H);
  console.log('\nSTATS status:', stats.status);
  if (stats.body && typeof stats.body === 'object') {
    console.log('  totalCompanies:', stats.body.totalCompanies, '| totalBranches:', stats.body.totalBranches, '| combinedEmployees:', stats.body.combinedEmployees);
  }

  // 3) employees
  const emps = await j('/api/employees', H);
  const arr = Array.isArray(emps.body) ? emps.body : (emps.body.data || emps.body.employees || []);
  console.log('\nEMPLOYEES status:', emps.status, '| count:', arr.length);
  // group by branch
  const byBranch = {};
  for (const e of arr) { const k = e.branchId || e.companyId || 'none'; byBranch[k] = (byBranch[k] || 0) + 1; }
  console.log('  by branch/company:', JSON.stringify(byBranch));

  // 4) payroll + attendance
  const pay = await j('/api/payroll', H);
  const payArr = Array.isArray(pay.body) ? pay.body : (pay.body.data || pay.body.payroll || []);
  console.log('\nPAYROLL status:', pay.status, '| count:', payArr.length);
  const att = await j('/api/attendance', H);
  const attArr = Array.isArray(att.body) ? att.body : (att.body.data || att.body.attendance || []);
  console.log('ATTENDANCE status:', att.status, '| count:', attArr.length);
})().catch((e) => console.error('ERR', e));
