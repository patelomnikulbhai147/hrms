const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

const makeRequest = (path, method, data, token) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(JSON.stringify(data)) } : {})
    }
  }, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
  });
  req.on('error', reject);
  if (data) req.write(JSON.stringify(data));
  req.end();
});

(async () => {
  try {
    console.log('--- E2E TEST: ALL USER OPERATIONS ---');

    // F. Login Validation (Super Admin)
    console.log('\n[TEST F] Logging in as superadmin...');
    const loginRes = await makeRequest('/api/auth/login', 'POST', { username: 'superadmin', password: 'default123' });
    if (loginRes.status !== 200) throw new Error('Superadmin login failed');
    const token = loginRes.body.token;
    console.log('✅ Superadmin authenticated.');

    // A. Create User
    console.log('\n[TEST A] Creating new user...');
    const uniqueId = Math.floor(Math.random() * 10000);
    const username = `officer_${uniqueId}`;
    const createData = {
      name: 'Full E2E Officer',
      email: `fulle2e${uniqueId}@test.com`,
      username,
      password: 'password123',
      role: 'Company Head',
      companyId: 'c-gcri'
    };
    const createRes = await makeRequest('/api/users', 'POST', createData, token);
    if (createRes.status !== 201) throw new Error('Create user failed');
    const newUserId = createRes.body.id;
    
    let dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (!dbUser) throw new Error('User not found in DB');
    console.log(`✅ User ${username} successfully inserted into PostgreSQL.`);

    // B. Edit User
    console.log('\n[TEST B] Editing User...');
    const editRes = await makeRequest(`/api/users/${newUserId}`, 'PUT', { role: 'HR' }, token);
    if (editRes.status !== 200) throw new Error('Edit user failed');
    
    dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (dbUser.role !== 'HR') throw new Error('Role not updated in DB');
    console.log(`✅ User role updated to HR in PostgreSQL.`);

    // C. Disable User
    console.log('\n[TEST C] Disabling User...');
    const disableRes = await makeRequest(`/api/users/${newUserId}`, 'PUT', { status: 'Disabled' }, token);
    if (disableRes.status !== 200) throw new Error('Disable user failed');
    
    dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (dbUser.status !== 'Disabled') throw new Error('Status not disabled in DB');
    console.log(`✅ User status updated to Disabled in PostgreSQL.`);

    // Re-enable for login test
    await makeRequest(`/api/users/${newUserId}`, 'PUT', { status: 'Active' }, token);

    // D. Reset Password
    console.log('\n[TEST D] Resetting Password...');
    const oldHash = dbUser.passwordHash;
    const resetRes = await makeRequest(`/api/users/${newUserId}/reset-password`, 'PUT', { newPassword: 'newpassword456' }, token);
    if (resetRes.status !== 200) throw new Error('Reset password failed');
    
    dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (dbUser.passwordHash === oldHash) throw new Error('Password hash did not change in DB');
    console.log(`✅ Password hash securely updated in PostgreSQL.`);

    // F. Login Validation (New User with new password)
    console.log('\n[TEST F] Logging in with new user and new password...');
    const newLoginRes = await makeRequest('/api/auth/login', 'POST', { username, password: 'newpassword456' });
    if (newLoginRes.status !== 200) throw new Error('New user login failed');
    console.log('✅ New user successfully authenticated with new password.');

    // E. Delete User
    console.log('\n[TEST E] Deleting User...');
    const delRes = await makeRequest(`/api/users/${newUserId}`, 'DELETE', null, token);
    if (delRes.status !== 200) throw new Error('Delete user failed');
    
    dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (dbUser) throw new Error('User still exists in DB');
    console.log(`✅ User permanently deleted from PostgreSQL.`);

    console.log('\n--- ALL E2E DB SYNC TESTS PASSED ---');

  } catch (err) {
    console.error('TEST FAILED:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
