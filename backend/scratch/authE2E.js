// End-to-end auth smoke test against the live server.
const BASE = 'http://localhost:5000/api/auth';
const prisma = require('../src/config/prisma');

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

(async () => {
  const TARGET_EMAIL = 'om@gmail.com';
  const NEW_PW = 'TestPass#2026';
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name} ${extra ? JSON.stringify(extra) : ''}`); fail++; }
  };

  console.log('\n1) Forgot-password with messy email (spaces + mixed case)');
  const fp = await post('/forgot-password', { email: '  OM@GMail.com  ' });
  check('returns 200', fp.status === 200, fp);
  check('dev OTP returned (no SMTP)', !!fp.json.devOtp, fp.json);
  const otp = fp.json.devOtp;

  console.log('\n2) Verify wrong OTP is rejected');
  const badOtp = await post('/verify-otp', { email: TARGET_EMAIL, otp: '000000' });
  check('wrong OTP rejected (400)', badOtp.status === 400, badOtp);

  console.log('\n3) Verify correct OTP');
  const vo = await post('/verify-otp', { email: TARGET_EMAIL, otp });
  check('correct OTP accepted (200)', vo.status === 200, vo);
  check('reset token issued', !!vo.json.resetToken, vo.json);
  const resetToken = vo.json.resetToken;

  console.log('\n4) Reset password (too short rejected, then valid)');
  const shortPw = await post('/reset-password', { resetToken, newPassword: 'short' });
  check('short password rejected (400)', shortPw.status === 400, shortPw);
  const rp = await post('/reset-password', { resetToken, newPassword: NEW_PW });
  check('valid reset succeeds (200)', rp.status === 200, rp);

  console.log('\n5) Reset token cannot be reused');
  const reuse = await post('/reset-password', { resetToken, newPassword: NEW_PW });
  check('reused token rejected', reuse.status === 400 || reuse.status === 401, reuse);

  console.log('\n6) Login with normalized email + remember me');
  const li = await post('/login', { username: '  OM@GMAIL.COM ', password: NEW_PW, rememberMe: true });
  check('login succeeds (200)', li.status === 200, li);
  check('token returned', !!li.json.token, li.json);
  check('rememberMe echoed true', li.json.rememberMe === true, li.json);
  check('no password leaked', li.json.user && !li.json.user.passwordHash && !li.json.user.password, Object.keys(li.json.user || {}));

  console.log('\n7) Login with wrong password is rejected + generic message');
  const bad = await post('/login', { username: TARGET_EMAIL, password: 'wrongwrong' });
  check('wrong password 401', bad.status === 401, bad);
  check('generic error message', bad.json.error === 'Invalid email or password.', bad.json);

  console.log('\n8) Login with unknown user is rejected');
  const unknown = await post('/login', { username: 'nobody@nowhere.test', password: 'x' });
  check('unknown user 401', unknown.status === 401, unknown);

  console.log('\n9) Login by username also works');
  const byUser = await post('/login', { username: 'om', password: NEW_PW });
  check('username login succeeds', byUser.status === 200, byUser);

  console.log('\n10) Audit log rows written');
  const audits = await prisma.loginAudit.findMany({
    where: { email: TARGET_EMAIL },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const reasons = audits.map(a => `${a.success ? 'OK' : 'X'}:${a.reason}`);
  console.log('   recent audit reasons:', reasons.join(', '));
  check('has a successful login audit', audits.some(a => a.success && a.reason && a.reason.startsWith('LOGIN')), reasons);
  check('has a failed (bad password) audit', audits.some(a => !a.success && a.reason === 'BAD_PASSWORD'), reasons);
  check('has password reset audit', audits.some(a => a.reason === 'PASSWORD_RESET'), reasons);

  console.log('\n11) lastLoginAt stamped');
  const u = await prisma.user.findFirst({ where: { email: TARGET_EMAIL } });
  check('lastLoginAt set', !!u.lastLoginAt, u && u.lastLoginAt);

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (e) => { console.error('E2E crashed:', e); await prisma.$disconnect(); process.exit(1); });
