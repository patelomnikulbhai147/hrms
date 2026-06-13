// Repairs active users whose plaintext `password` (shown to admins as their
// registered password) no longer matches their stored bcrypt `passwordHash`,
// which silently locks them out. The hash is re-derived from the known plaintext.
// Old hashes are snapshotted to a backup file first so the change is reversible.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

(async () => {
  const users = await prisma.user.findMany();
  const backup = [];
  const repaired = [];
  const skipped = [];

  for (const u of users) {
    const isActive = (u.status || '').toLowerCase() === 'active';
    const plaintext = u.password;
    if (!isActive) { skipped.push(`${u.email} (status=${u.status})`); continue; }
    if (!plaintext || plaintext === 'REDACTED') { skipped.push(`${u.email} (no usable plaintext)`); continue; }

    const matches = u.passwordHash && (await bcrypt.compare(plaintext, u.passwordHash));
    if (matches) { continue; } // already in sync — leave untouched

    backup.push({ id: u.id, email: u.email, oldHash: u.passwordHash });
    const newHash = await bcrypt.hash(plaintext, 10);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: newHash } });
    repaired.push(`${u.email} (login now works with registered password)`);
  }

  if (backup.length) {
    const file = path.join(__dirname, `passwordHash-backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log('Old hashes backed up to:', file);
  }
  console.log('\nREPAIRED:', repaired.length ? repaired.join('\n  ') : 'none');
  console.log('\nSKIPPED:', skipped.join('\n  '));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
