// ─────────────────────────────────────────────────────────────────────────────
// SSL PROVISIONER — pluggable certificate backend for custom domains.
//
// Providers (CUSTOM_DOMAIN_SSL_PROVIDER):
//   'certbot' — production (EC2): shells out to certbot for a real Let's
//               Encrypt certificate (webroot/nginx plugin, non-interactive).
//               Renewal rides certbot's own timer; renewSsl() re-checks expiry.
//   'manual'  — DEFAULT: the certificate is provisioned by the platform
//               operator (or a wildcard/ALB cert already covers the domain);
//               a Super Admin marks it issued from the White Label panel.
//   'mock'    — local QA only: issues instantly with a 90-day expiry.
//
// The customer NEVER handles SSL: whichever provider runs, the domain moves
// SSL_PENDING → ISSUED automatically or via the platform operator.
// ─────────────────────────────────────────────────────────────────────────────
const { execFile } = require('child_process');

const provider = () => String(process.env.CUSTOM_DOMAIN_SSL_PROVIDER || 'manual').toLowerCase();

const DAY = 86400000;

/**
 * Request a certificate for the domain. Returns
 * { status: 'ISSUED'|'PENDING', issuedAt?, expiresAt?, error? } — never throws.
 */
async function requestCertificate(domain) {
  switch (provider()) {
    case 'mock':
      return { status: 'ISSUED', issuedAt: new Date(), expiresAt: new Date(Date.now() + 90 * DAY) };
    case 'certbot':
      return new Promise((resolve) => {
        execFile(
          'certbot',
          ['certonly', '--nginx', '-d', domain, '--non-interactive', '--agree-tos', '--keep-until-expiring',
            '-m', process.env.LETSENCRYPT_EMAIL || 'admin@zeniahr.com'],
          { timeout: 120000 },
          (err, _stdout, stderr) => {
            if (err) resolve({ status: 'PENDING', error: `certbot: ${String(stderr || err.message).slice(0, 500)}` });
            else resolve({ status: 'ISSUED', issuedAt: new Date(), expiresAt: new Date(Date.now() + 90 * DAY) });
          }
        );
      });
    case 'manual':
    default:
      // Platform operator provisions the cert (wildcard / SA marks issued).
      return { status: 'PENDING' };
  }
}

/** Renewal attempt — same contract as requestCertificate. */
async function renewCertificate(domain) {
  return requestCertificate(domain);
}

module.exports = { provider, requestCertificate, renewCertificate };
