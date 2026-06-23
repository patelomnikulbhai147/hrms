// ─────────────────────────────────────────────────────────────────────────────
// Smart Document Builder — system template library.
//
// Generates a rich, multi-theme library of HR document templates: every category
// ships 8 professionally-themed variants so a company can pick the look that fits
// its brand. Templates are data only — they plug into the EXISTING Documents.tsx
// engine (same `data-token` placeholder markup, same compile/preview/PDF/print/
// save path). System templates are flagged `isSystem` and are delete-protected;
// users can still Edit, Duplicate, and Save-as-new from them.
// ─────────────────────────────────────────────────────────────────────────────

// The 8 true layouts (must match DocumentCanvas DOC_LAYOUTS order). Each template
// variant maps to a different one so the 8 variants are structurally distinct,
// not just recoloured.
const LAYOUT_ORDER = [
  'modern-corporate', 'executive-premium', 'sidebar-tech', 'minimal-clean',
  'legal-agreement', 'government-format', 'international', 'enterprise-band',
];

export interface DocTemplate {
  id: string;
  templateName: string;
  category: string;
  group?: string;
  isSystem?: boolean;
  layout?: string;
  subject: string;
  body: string;
  companyId: string;
  branding?: {
    companyName: string; primaryColor: string; logoText: string;
    signatureText: string; footerText: string; watermark: string;
  };
  createdAt: string;
}

// Bump when the seeded library changes so existing companies get re-seeded
// (custom/user templates are always preserved by the migration in Documents.tsx).
export const DOC_LIBRARY_VERSION = 2;

// 8 distinct brand themes (colour per variant index).
const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#059669', '#7c3aed', '#db2777', '#d97706', '#0f766e'];
// Generic 8-style naming used for categories the spec didn't name explicitly.
const GENERIC_STYLES = ['Standard', 'Professional', 'Executive', 'Corporate', 'Formal', 'Modern', 'Premium', 'Enterprise'];

// Exact placeholder-span markup the editor/compiler already understands.
const tok = (key: string, label: string) =>
  `<span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="${key}" contenteditable="false">👤 ${label}</span>`;

const NAME = tok('employee_name', 'Employee Name');
const DESIG = tok('designation', 'Designation');
const DEPT = tok('department', 'Department');
const CO = tok('company_name', 'Company Name');
const DOJ = tok('joining_date', 'Joining Date');
const SAL = tok('salary', 'Salary');
const EMAIL = tok('company_email', 'Company Email');
const P = (html: string) => `<p>${html}</p>`;

interface CatDef { group: string; category: string; subject: string; names?: string[]; watermark?: string; signature?: string; body: string; }

// ── Category definitions (grouped). Each provides one base body; the 8 variants
//    differ by theme colour + name + branding, so the document content stays
//    correct while the look varies. ──────────────────────────────────────────
const CATEGORIES: CatDef[] = [
  // ════════ Offer & Onboarding ════════
  {
    group: 'Offer & Onboarding', category: 'Corporate Offer Letter', watermark: 'OFFER',
    subject: 'Employment Offer Letter', signature: 'Authorized HR Operations Signatory',
    names: ['Modern Corporate', 'Executive Corporate', 'Professional Blue Theme', 'Minimal Clean', 'Enterprise Standard', 'Premium Corporate', 'Formal Business', 'Modern HR Style'],
    body: P(`Dear ${NAME},`) + P(`We are delighted to extend an offer of employment for the position of ${DESIG} in the ${DEPT} division at ${CO}.`) +
      `<ul><li>Effective Joining Date: ${DOJ}</li><li>Annual Compensation: INR ${SAL}</li></ul>` +
      P(`We are confident your skills will contribute significantly to our success. Please sign to confirm your acceptance. Welcome aboard!`),
  },
  {
    group: 'Offer & Onboarding', category: 'Startup Offer Letter', watermark: 'WELCOME',
    subject: 'You\'re In! Offer to Join the Team', signature: 'The Founders Crew',
    names: ['Startup Modern', 'Tech Startup', 'Innovation Style', 'Growth Company', 'Creative Startup', 'Flat Design', 'Founder Style', 'Startup Professional'],
    body: P(`Hey ${NAME},`) + P(`We loved your energy and skills — we are thrilled to offer you the role of ${DESIG} on our ${DEPT} squad at ${CO}!`) +
      `<ul><li>Launch Day: ${DOJ}</li><li>Base Package: INR ${SAL} per annum</li></ul>` +
      P(`Let's build something amazing together. Reply to confirm and we'll get you set up.`),
  },
  {
    group: 'Offer & Onboarding', category: 'Internship Offer Letter', watermark: 'INTERNSHIP',
    subject: 'Offer of Internship Training Program', signature: 'Academic Relations Lead',
    names: ['Student Professional', 'Campus Selection', 'Internship Standard', 'Internship Premium', 'Modern Internship', 'Training Program', 'Graduate Entry', 'Fresher Internship'],
    body: P(`Dear ${NAME},`) + P(`We are pleased to offer you an internship as ${DESIG} in the ${DEPT} division at ${CO}.`) +
      `<ul><li>Start Date: ${DOJ}</li><li>Monthly Stipend: INR ${SAL}</li></ul>` +
      P(`We look forward to providing a rewarding learning experience to kickstart your career.`),
  },
  {
    group: 'Offer & Onboarding', category: 'Joining Letter', watermark: 'JOINED',
    subject: 'Confirmation of Joining & Reporting Instructions', signature: 'VP of Talent Operations',
    names: ['Standard Joining', 'Executive Joining', 'Professional Joining', 'Corporate Joining', 'Formal Joining', 'Modern Joining', 'Enterprise Joining', 'Premium Joining'],
    body: P(`Dear ${NAME},`) + P(`We warmly welcome you to ${CO}. This confirms that you have joined as ${DESIG} in the ${DEPT} team, effective ${DOJ}.`) +
      P(`Please coordinate with HR & IT to complete onboarding formalities and set up your workplace profiles. We look forward to a successful journey together.`),
  },
  {
    group: 'Offer & Onboarding', category: 'Appointment Letter', watermark: 'APPOINTED',
    subject: 'Letter of Appointment', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`With reference to your application and interview, we are pleased to appoint you as ${DESIG} in the ${DEPT} department at ${CO}, effective ${DOJ}.`) +
      `<ul><li>Annual Remuneration: INR ${SAL}</li><li>Your appointment is governed by the company's policies and terms of employment.</li></ul>` +
      P(`We welcome you and wish you a long and rewarding association.`),
  },
  {
    group: 'Offer & Onboarding', category: 'Confirmation Letter', watermark: 'CONFIRMED',
    subject: 'Confirmation of Employment', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`We are pleased to inform you that, based on your performance during the probation period, your services as ${DESIG} in the ${DEPT} department at ${CO} are hereby confirmed with effect from ${DOJ}.`) +
      P(`We appreciate your contribution and look forward to your continued growth with us.`),
  },

  // ════════ Employee Lifecycle ════════
  {
    group: 'Employee Lifecycle', category: 'Promotion Letter', watermark: 'PROMOTED',
    subject: 'Letter of Promotion', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`In recognition of your performance and dedication, we are delighted to promote you to the position of ${DESIG} in the ${DEPT} department at ${CO}, effective ${DOJ}.`) +
      `<ul><li>Revised Annual Compensation: INR ${SAL}</li></ul>` + P(`Congratulations! We are confident you will excel in your expanded role.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Increment Letter', watermark: 'INCREMENT',
    subject: 'Salary Increment Letter', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`We are pleased to inform you that, in recognition of your contribution as ${DESIG}, your annual compensation has been revised to INR ${SAL}, effective ${DOJ}.`) +
      P(`Thank you for your continued commitment to ${CO}. Keep up the excellent work.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Transfer Letter', watermark: 'TRANSFER',
    subject: 'Letter of Transfer', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`This is to inform you that you are being transferred to the ${DEPT} department at ${CO} in the capacity of ${DESIG}, effective ${DOJ}.`) +
      P(`All other terms and conditions of your employment remain unchanged. Please report to your new reporting manager on the effective date.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Warning Letter', watermark: 'WARNING',
    subject: 'Official Warning Letter', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`This letter serves as an official warning regarding conduct/performance inconsistent with the expectations for your role as ${DESIG} in the ${DEPT} department at ${CO}.`) +
      P(`You are advised to demonstrate immediate and sustained improvement. Failure to do so may lead to further disciplinary action as per company policy.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Termination Letter', watermark: 'TERMINATED',
    subject: 'Termination of Employment', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`With reference to your employment as ${DESIG} in the ${DEPT} department at ${CO}, we regret to inform you that your services are terminated, effective ${DOJ}, in accordance with the terms of your employment and company policy.`) +
      P(`Please complete the exit and clearance formalities with HR. Your final settlement will be processed as per policy.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Relieving Letter', watermark: 'RELIEVED',
    subject: 'Relieving Order and Acceptance of Resignation', signature: 'Vice President of HR',
    names: ['Standard Relieving', 'Professional Relieving', 'Executive Relieving', 'Corporate Exit', 'Formal Relieving', 'Modern Relieving', 'HR Certified', 'Enterprise Exit'],
    body: P(`Dear ${NAME},`) + P(`This is in reference to your resignation from ${CO}. We confirm that you have been relieved from your duties as ${DESIG} effective ${DOJ}.`) +
      P(`We thank you for your contributions during your tenure and wish you success in your future endeavours.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Experience Letter', watermark: 'EXPERIENCE',
    subject: 'To Whomsoever It May Concern — Experience Certificate', signature: 'Head of Human Resources',
    names: ['Standard Experience', 'Premium Experience', 'Executive Experience', 'Formal Experience', 'Minimal Experience', 'Modern Experience', 'Corporate Experience', 'HR Verified Experience'],
    body: P(`This is to certify that ${NAME} was employed with ${CO} as ${DESIG} in the ${DEPT} division.`) +
      P(`During the tenure of service, we found them diligent, professional, and cooperative. We wish them the very best in their future career.`),
  },
  {
    group: 'Employee Lifecycle', category: 'Resignation Acceptance Letter', watermark: 'ACCEPTED',
    subject: 'Acceptance of Resignation', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`We acknowledge and accept your resignation from the position of ${DESIG} in the ${DEPT} department at ${CO}, with your last working day as ${DOJ}.`) +
      P(`We thank you for your service and request you to complete the handover and exit formalities. We wish you all the best.`),
  },

  // ════════ Payroll & Compensation ════════
  {
    group: 'Payroll & Compensation', category: 'Payslip Template', watermark: 'PAID',
    subject: 'Monthly Pay Statement', signature: 'Payroll Specialist',
    names: ['Standard Payslip', 'Corporate Payslip', 'Executive Payslip', 'Professional Payslip', 'Compact Payslip', 'Detailed Payslip', 'Modern Payslip', 'Enterprise Payslip'],
    body: P(`Monthly statement for ${NAME}, serving as ${DESIG} at ${CO}.`) +
      P(`Gross compensation is structured per the active payroll tables below. For queries, email ${EMAIL}.`),
  },
  {
    group: 'Payroll & Compensation', category: 'Salary Revision Letter', watermark: 'REVISED',
    subject: 'Salary Revision Letter', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`We are pleased to inform you that your compensation as ${DESIG} in the ${DEPT} department at ${CO} has been revised to INR ${SAL} per annum, effective ${DOJ}.`) +
      P(`This revision reflects our appreciation of your performance. Keep up the great work!`),
  },
  {
    group: 'Payroll & Compensation', category: 'Bonus Letter', watermark: 'BONUS',
    subject: 'Bonus Award Letter', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`In recognition of your valuable contribution as ${DESIG}, ${CO} is pleased to award you a bonus, payable with effect from ${DOJ}.`) +
      P(`Thank you for your dedication and we look forward to your continued success.`),
  },
  {
    group: 'Payroll & Compensation', category: 'Incentive Letter', watermark: 'INCENTIVE',
    subject: 'Performance Incentive Letter', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`Congratulations! Based on your performance as ${DESIG} in the ${DEPT} department, you have earned a performance incentive at ${CO}, effective ${DOJ}.`) +
      P(`We appreciate your efforts and encourage you to keep achieving great results.`),
  },

  // ════════ HR & Compliance ════════
  {
    group: 'HR & Compliance', category: 'NDA', watermark: 'CONFIDENTIAL',
    subject: 'Non-Disclosure Agreement', signature: 'Authorized Signatory',
    body: P(`This Non-Disclosure Agreement is entered into between ${CO} and ${NAME}, ${DESIG}.`) +
      P(`The employee agrees to keep confidential all proprietary information, trade secrets, and business data of ${CO}, both during and after the term of employment, and to use such information solely for authorized purposes.`),
  },
  {
    group: 'HR & Compliance', category: 'Confidentiality Agreement', watermark: 'CONFIDENTIAL',
    subject: 'Employee Confidentiality Agreement', signature: 'Authorized Signatory',
    body: P(`I, ${NAME}, employed as ${DESIG} in the ${DEPT} department at ${CO}, acknowledge my obligation to protect all confidential and proprietary information of the company.`) +
      P(`I agree not to disclose such information to any third party without authorization, in accordance with company policy and applicable law.`),
  },
  {
    group: 'HR & Compliance', category: 'Policy Acceptance Letter', watermark: 'POLICY',
    subject: 'Acknowledgement of Company Policies', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`This acknowledges that you, as ${DESIG} in the ${DEPT} department at ${CO}, have received, read, and agreed to abide by the company's policies, including the Code of Conduct.`) +
      P(`Please sign below to confirm your acceptance.`),
  },

  // ════════ Recruitment ════════
  {
    group: 'Recruitment', category: 'Interview Call Letter', watermark: 'INTERVIEW',
    subject: 'Interview Call Letter', signature: 'Talent Acquisition Team',
    body: P(`Dear ${NAME},`) + P(`Thank you for applying for the position of ${DESIG} in the ${DEPT} department at ${CO}. We are pleased to invite you for an interview on ${DOJ}.`) +
      P(`Please carry a copy of your resume and a valid photo ID. We look forward to meeting you. For queries, contact ${EMAIL}.`),
  },
  {
    group: 'Recruitment', category: 'Selection Letter', watermark: 'SELECTED',
    subject: 'Letter of Selection', signature: 'Talent Acquisition Team',
    body: P(`Dear ${NAME},`) + P(`Congratulations! Following your interview, you have been selected for the position of ${DESIG} in the ${DEPT} department at ${CO}.`) +
      P(`A formal offer with detailed terms will follow shortly. We are excited to have you join us.`),
  },
  {
    group: 'Recruitment', category: 'Rejection Letter', watermark: 'NOTICE',
    subject: 'Application Status Update', signature: 'Talent Acquisition Team',
    body: P(`Dear ${NAME},`) + P(`Thank you for your interest in the ${DESIG} role and for the time you invested in our process at ${CO}.`) +
      P(`After careful consideration, we have decided to proceed with other candidates at this time. We were impressed by your background and will keep your profile on file for suitable future openings. We wish you the very best.`),
  },

  // ════════ General ════════
  {
    group: 'General', category: 'Appreciation Letter', watermark: 'THANK YOU',
    subject: 'Letter of Appreciation', signature: 'Head of Human Resources',
    body: P(`Dear ${NAME},`) + P(`On behalf of ${CO}, we would like to express our sincere appreciation for your outstanding contribution as ${DESIG} in the ${DEPT} department.`) +
      P(`Your dedication and effort have made a real difference. Thank you, and keep up the excellent work!`),
  },
  {
    group: 'General', category: 'Achievement Certificate', watermark: 'ACHIEVEMENT',
    subject: 'Certificate of Achievement', signature: 'Head of Human Resources',
    body: P(`This certificate is proudly presented to ${NAME}, ${DESIG}, in recognition of outstanding achievement and exemplary performance at ${CO}.`) +
      P(`Presented with appreciation for commitment and excellence.`),
  },
  {
    group: 'General', category: 'Training Completion Certificate', watermark: 'CERTIFIED',
    subject: 'Certificate of Training Completion', signature: 'Learning & Development Lead',
    body: P(`This is to certify that ${NAME}, ${DESIG} in the ${DEPT} department at ${CO}, has successfully completed the prescribed training program.`) +
      P(`We commend the dedication shown and wish continued success in applying these skills.`),
  },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const shortLabel = (cat: string) => cat.replace(/\s*(Letter|Template|Form|Notice|Agreement|Acknowledgement|Certificate)$/i, '').trim() || cat;

/** Friendly display name for a category (handles custom categories gracefully). */
export function friendlyCategory(cat: string): string {
  return cat;
}

/** Sections → categories, for a grouped category selector. */
export const DOC_GROUPS: { group: string; categories: string[] }[] = (() => {
  const map = new Map<string, string[]>();
  for (const c of CATEGORIES) { if (!map.has(c.group)) map.set(c.group, []); map.get(c.group)!.push(c.category); }
  return [...map.entries()].map(([group, categories]) => ({ group, categories }));
})();

export const DEFAULT_CATEGORY = CATEGORIES[0].category;
export const ALL_CATEGORIES = CATEGORIES.map(c => c.category);

/** Build the full system template library for a company (8 themed variants each). */
export function buildTemplateLibrary(companyId: string, companyName: string): DocTemplate[] {
  const created = new Date().toISOString().split('T')[0];
  const logoText = (companyName || 'CO').slice(0, 2).toUpperCase();
  const out: DocTemplate[] = [];
  for (const def of CATEGORIES) {
    const names = def.names && def.names.length >= 8
      ? def.names
      : GENERIC_STYLES.map(s => `${s} ${shortLabel(def.category)}`);
    for (let i = 0; i < 8; i++) {
      out.push({
        id: `sys-${slug(def.category)}-${i + 1}`,
        templateName: names[i],
        category: def.category,
        group: def.group,
        isSystem: true,
        layout: LAYOUT_ORDER[i % LAYOUT_ORDER.length],
        subject: def.subject,
        body: def.body,
        companyId,
        branding: {
          companyName,
          primaryColor: PALETTE[i % PALETTE.length],
          logoText,
          signatureText: def.signature || 'Authorized Signatory',
          footerText: `${companyName} · Confidential Document`,
          watermark: def.watermark || shortLabel(def.category).toUpperCase().slice(0, 12),
        },
        createdAt: created,
      });
    }
  }
  return out;
}
