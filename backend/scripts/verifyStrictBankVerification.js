/**
 * Verification script for strict Bank Account Verification flow.
 * Confirms:
 * 1. Different accounts return different account holder names when supported (SBI, HDFC, ICICI, Axis, BOB).
 * 2. No static/default fallback names appear.
 * 3. "Not Available" is not returned when verified.
 * 4. When provider cannot verify ownership/name (e.g. account ends in 1111), returns VERIFICATION_INCOMPLETE without VERIFIED status.
 *
 * Run: node backend/scripts/verifyStrictBankVerification.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0;
let failed = 0;

function check(label, cond, details = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${details ? ' — ' + details : ''}`);
  }
}

(async () => {
  console.log('=== STRICT BANK ACCOUNT VERIFICATION SUITE ===\n');

  const user = await prisma.user.findFirst({
    where: { status: 'Active' },
    select: { id: true, email: true, role: true }
  });
  if (!user) throw new Error('No active user found in database');

  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '10m' });
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log(`Authenticated as: ${user.email} (${user.role})\n`);

  const testCases = [
    {
      name: '1. SBI Bank Account Verification',
      payload: { ifsc: 'SBIN0001234', accountNumber: '304050607080' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: '2. HDFC Bank Account Verification',
      payload: { ifsc: 'HDFC0001234', accountNumber: '50100223344556' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: '3. ICICI Bank Account Verification',
      payload: { ifsc: 'ICIC0000001', accountNumber: '000101556677' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: '4. Axis Bank Account Verification',
      payload: { ifsc: 'UTIB0000001', accountNumber: '91201004455667' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: '5. Bank of Baroda Account Verification',
      payload: { ifsc: 'BARB0000001', accountNumber: '30110200005566' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: '6. Known Provider DB Account (Rajesh Kumar Shah)',
      payload: { ifsc: 'HDFC0001234', accountNumber: '50100123456789' },
      expectedStatus: 200,
      expectVerified: true,
      expectStatus: 'VERIFIED',
      expectExactName: 'Rajesh Kumar Shah'
    },
    {
      name: '7. Provider Does Not Return Name (ends in 1111)',
      payload: { ifsc: 'SBIN0001234', accountNumber: '304050601111' },
      expectedStatus: 200,
      expectVerified: false,
      expectStatus: 'VERIFICATION_INCOMPLETE',
      expectNullName: true
    },
    {
      name: '8. Verification Failure (ends in 0000)',
      payload: { ifsc: 'ICIC0000001', accountNumber: '123456780000' },
      expectedStatus: 422,
      expectVerified: false,
      expectStatus: 'FAILED'
    }
  ];

  const returnedNames = new Set();

  for (const tc of testCases) {
    console.log(`--- Test Case: ${tc.name} ---`);
    const res = await fetch(`${BASE}/bank/verify-account`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tc.payload)
    });
    const body = await res.json();
    console.log(`HTTP Status: ${res.status}`);
    console.log('Response Body:', JSON.stringify(body, null, 2));

    check(`HTTP Status is ${tc.expectedStatus}`, res.status === tc.expectedStatus, `Got ${res.status}`);
    check(`verified is ${tc.expectVerified}`, body.verified === tc.expectVerified, `Got ${body.verified}`);
    check(`status is ${tc.expectStatus}`, body.status === tc.expectStatus, `Got ${body.status}`);

    if (tc.expectVerified) {
      check(`accountHolderName is present and valid`, !!body.accountHolderName && body.accountHolderName !== 'Not Available' && body.accountHolderName !== 'N/A', `Got ${body.accountHolderName}`);
      check(`no static placeholder name`, !['John Doe', 'Tushar Mehta', 'Demo User', 'Test User', 'Static Name'].includes(body.accountHolderName), `Got ${body.accountHolderName}`);
      returnedNames.add(body.accountHolderName);
    }

    if (tc.expectExactName) {
      check(`exact name matched`, body.accountHolderName === tc.expectExactName, `Got ${body.accountHolderName}`);
    }

    if (tc.expectNullName) {
      check(`accountHolderName is null when provider does not return name`, body.accountHolderName === null || body.accountHolderName === undefined, `Got ${body.accountHolderName}`);
    }

    console.log('');
  }

  check('Different accounts return different account holder names', returnedNames.size >= 5, `Unique names returned: ${returnedNames.size}`);

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})()
  .catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
