// ─────────────────────────────────────────────────────────────────────────────
// EMAIL BRANDING — the single source of truth for who an email appears to be
// from, and which logo it carries.
//
// Every outbound email (OTP, welcome, payslip, invoice, reminders, scheduled
// reports) resolves its branding here, so a tenant's people only ever see their
// OWN company name and logo. Nothing about the sender is hardcoded: the values
// come from the Company Profile record, and fall back to the product name only
// when a company has not been resolved (e.g. a password reset for an address
// that is not yet attached to a company).
//
// Logos are stored as base64 data URIs on the Company row. Most mail clients
// refuse to render a data: URI in an <img>, so a base64 logo is emitted as an
// INLINE (cid:) attachment instead — which they do render. An http(s) logo is
// used directly. If there is no usable logo we fall back to a text wordmark,
// which is also what image-blocking clients show.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');

/** Product-level fallback used only when a company cannot be resolved. */
const DEFAULT_BRAND = {
  name: 'ZeniaHR',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@zeniahr.com',
  website: '',
  logoSrc: process.env.MAIL_LOGO_URL || '',   // optional hosted default logo
  logoAttachment: null,
};

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const isHttpUrl = (v) => /^https?:\/\//i.test(clean(v));
const isDataUri = (v) => /^data:image\/[a-z.+-]+;base64,/i.test(clean(v));

/** Turn a base64 data URI into a nodemailer inline attachment. */
function toInlineAttachment(dataUri) {
  const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(clean(dataUri));
  if (!m) return null;
  const ext = (m[1].split('/')[1] || 'png').replace('+xml', '');
  return {
    filename: `logo.${ext}`,
    content: Buffer.from(m[2], 'base64'),
    contentType: m[1],
    cid: 'companylogo',        // referenced as <img src="cid:companylogo">
    contentDisposition: 'inline',
  };
}

/**
 * Resolve the email branding for a company (or the product default).
 * A branch resolves to its parent company, so branch users still send mail
 * under the company's identity. Never throws — email must not break on this.
 *
 * @param {number|string|null} companyId
 * @returns {Promise<{name,supportEmail,website,logoSrc,logoAttachment}>}
 */
async function getEmailBranding(companyId) {
  const id = Number(companyId);
  if (!id || Number.isNaN(id)) return { ...DEFAULT_BRAND };
  try {
    let company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true, parentCompanyId: true, name: true, legalName: true, displayName: true,
        tradeName: true, logo: true, logoImage: true, supportEmail: true, contactEmail: true,
        adminEmail: true, website: true,
      },
    });
    // Branch workspace → bill/send under the parent company's identity.
    if (company && company.parentCompanyId) {
      company = await prisma.company.findUnique({
        where: { id: company.parentCompanyId },
        select: {
          id: true, parentCompanyId: true, name: true, legalName: true, displayName: true,
          tradeName: true, logo: true, logoImage: true, supportEmail: true, contactEmail: true,
          adminEmail: true, website: true,
        },
      }) || company;
    }
    if (!company) return { ...DEFAULT_BRAND };

    const name = clean(company.name) || clean(company.displayName) || clean(company.legalName)
      || clean(company.tradeName) || DEFAULT_BRAND.name;

    const rawLogo = clean(company.logoImage) || clean(company.logo);
    let logoSrc = '';
    let logoAttachment = null;
    if (isHttpUrl(rawLogo)) {
      logoSrc = rawLogo;
    } else if (isDataUri(rawLogo)) {
      logoAttachment = toInlineAttachment(rawLogo);
      if (logoAttachment) logoSrc = 'cid:companylogo';
    }
    if (!logoSrc) logoSrc = DEFAULT_BRAND.logoSrc;   // ZeniaHR default (if hosted)

    return {
      name,
      supportEmail: clean(company.supportEmail) || clean(company.contactEmail)
        || clean(company.adminEmail) || DEFAULT_BRAND.supportEmail,
      website: clean(company.website),
      logoSrc,
      logoAttachment,
    };
  } catch (_) {
    return { ...DEFAULT_BRAND };   // never let branding lookup break an email
  }
}

/**
 * Email header block: the company logo when we have one, otherwise a wordmark.
 * `color` is the text colour used for the wordmark fallback.
 */
function brandHeaderHtml(branding, color = '#ffffff') {
  const b = branding || DEFAULT_BRAND;
  const safe = String(b.name || DEFAULT_BRAND.name).replace(/[&<>"]/g, '');
  return b.logoSrc
    ? `<img src="${b.logoSrc}" alt="${safe}" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;max-height:40px;margin:0 auto;" />`
    : `<span style="font-size:26px;font-weight:800;color:${color};letter-spacing:0.5px;">${safe}</span>`;
}

/** Standard sign-off: "Regards,<br/>{company name}" — never a hardcoded name. */
function signOffHtml(branding) {
  const safe = String((branding && branding.name) || DEFAULT_BRAND.name).replace(/[&<>"]/g, '');
  return `Regards,<br/>${safe}`;
}
function signOffText(branding) {
  return `Regards,\n${(branding && branding.name) || DEFAULT_BRAND.name}`;
}

module.exports = { getEmailBranding, brandHeaderHtml, signOffHtml, signOffText, DEFAULT_BRAND };
