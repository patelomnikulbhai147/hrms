// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION INVOICE ISSUER SETTINGS (Super Admin)
//
// The "from" side of a Subscription Billing invoice: ZeniaHR's own branding,
// statutory ids, bank details, signature, notes/terms and footer. File-backed +
// cached (same pattern as planStore / integrations.json) so there is NO schema
// change and editing it re-renders every invoice instantly.
//
// SCOPE: used ONLY by the Super Admin Subscription Billing invoice. It never
// touches the company-side Invoice Management module, payroll payslips, or any
// customer invoice template.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'invoiceSettings.json');

const DEFAULTS = {
  // Identity / branding
  name: 'ZeniaHR',
  legalName: 'ZeniaHR Technologies Pvt. Ltd.',
  tagline: 'HR & Payroll Management Platform',
  logo: '',                       // base64 data-URI or absolute URL (optional)
  accentColor: '#7c3aed',
  // Address & contact
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  phone: '',
  email: 'billing@zeniahr.com',
  website: 'www.zeniahr.com',
  // Statutory
  gstin: '',
  pan: '',
  // Bank / payment
  bankAccountName: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankBranch: '',
  upiId: '',
  showQrPlaceholder: true,
  // Invoice document
  invoicePrefix: 'ZEN-INV',       // mirrored into the invoice-number generator
  paymentTerms: 'Due on receipt',
  defaultNotes: '',
  defaultTerms: '1. All amounts are in INR.\n2. Payment is due by the invoice due date.\n3. Subject to jurisdiction of the registered office.',
  footerText: 'Powered by ZeniaHR · This is a computer generated invoice.',
  // Signature
  signatoryName: 'Authorized Signatory',
  signatureImage: '',             // base64 data-URI (optional)
  roundOff: true,                 // show a Round Off line (nearest rupee)
};

let cache = null;

function readFile() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function getIssuer() {
  if (!cache) cache = { ...DEFAULTS, ...readFile() };
  return { ...cache };
}

function saveIssuer(patch = {}) {
  const current = getIssuer();
  // Only accept known keys — never let arbitrary payload keys into the file.
  const next = { ...current };
  for (const k of Object.keys(DEFAULTS)) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    throw new Error(`Could not save invoice settings: ${e.message}`);
  }
  cache = next;
  return { ...next };
}

const reload = () => { cache = null; return getIssuer(); };

module.exports = { DEFAULTS, getIssuer, saveIssuer, reload };
