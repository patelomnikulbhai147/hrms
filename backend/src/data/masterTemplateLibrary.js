/**
 * Master Template Library generator (Enterprise Communication Workflow).
 *
 * Produces 100+ professional templates across the 15 enterprise categories. Each
 * template carries the SAME portable design JSON (`layout`) that communication_
 * templates use, so a company copy renders identically through the existing
 * GreetingCard renderer / image pipeline — no new rendering code.
 *
 * Pure data generator: no DB, no side-effects. Seeding lives in the controller.
 */
const { STYLES, FESTIVALS } = require('./communicationSamples');

// The 15 enterprise categories (Step 1). `eventKey` links a category to the
// automation event it services (used by Event → Template mapping).
const CATEGORIES = [
  { cat: 'Birthday',            eventKey: 'birthday',        emoji: '🎂', art: 'birthday',    greeting: 'Happy Birthday, {{employee_name}}!',      subtitle: '{{designation}}',                 body: 'Wishing you joy, good health and success on your special day. Thank you for being a valued part of {{company_name}}!', signoff: '— {{company_name}} Team', caption: '🎂 Happy Birthday {{employee_name}}! — {{company_name}}' },
  { cat: 'Work Anniversary',    eventKey: 'anniversary',     emoji: '🏆', art: 'anniversary', greeting: 'Happy Work Anniversary!',                 subtitle: '{{years_completed}} years with {{company_name}}', body: 'Congratulations {{employee_name}} on completing {{years_completed}} remarkable years with {{company_name}}. Your dedication inspires us all!', signoff: 'With gratitude, {{company_name}}', caption: '🏆 {{years_completed}} years! Happy Work Anniversary, {{employee_name}}.' },
  { cat: 'Joining Anniversary', eventKey: 'joining',         emoji: '👋', art: 'welcome',     greeting: 'Welcome Aboard, {{employee_name}}!',      subtitle: '{{designation}} · {{department}}', body: 'The entire {{company_name}} family is delighted to welcome you. We look forward to achieving great things together!', signoff: 'Warm regards, {{company_name}}', caption: '👋 Welcome to {{company_name}}, {{employee_name}}!' },
  { cat: 'Promotion',           eventKey: 'promotion',       emoji: '🚀', art: 'promotion',   greeting: 'Congratulations on Your Promotion!',      subtitle: 'Promoted to {{designation}}',     body: 'Your hard work has earned you this well-deserved promotion, {{employee_name}}. {{company_name}} is proud of you. Onward and upward!', signoff: 'Cheers, {{company_name}}', caption: '🚀 Congratulations on your promotion, {{employee_name}}!' },
  { cat: 'Confirmation',        eventKey: 'confirmation',    emoji: '✅', art: 'award',       greeting: 'Employment Confirmed!',                   subtitle: '{{designation}} · {{department}}', body: 'Congratulations {{employee_name}}! We are pleased to confirm your employment with {{company_name}}. Welcome to the permanent team!', signoff: 'Best regards, {{company_name}}', caption: '✅ Your employment is confirmed, {{employee_name}}!' },
  { cat: 'Leave',               eventKey: 'leave_approved',  emoji: '📝', art: 'notice',      greeting: 'Leave Approved',                          subtitle: '',                                 body: 'Dear {{employee_name}}, your leave request has been approved. Please check the employee portal for details. Enjoy your time off!', signoff: 'HR Team, {{company_name}}', showPhoto: false, caption: '📝 Leave approved — {{company_name}}' },
  { cat: 'Attendance',          eventKey: 'attendance',      emoji: '⏰', art: 'notice',      greeting: 'Attendance Reminder',                     subtitle: '',                                 body: 'Dear {{employee_name}}, we noticed your attendance has not been marked today. Kindly check in at the earliest.', signoff: 'HR Team, {{company_name}}', showPhoto: false, caption: '⏰ Attendance reminder — {{company_name}}' },
  { cat: 'Payroll',             eventKey: 'payroll',         emoji: '💰', art: 'finance',     greeting: 'Salary Credited',                         subtitle: '{{current_year}}',                 body: 'Dear {{employee_name}}, your salary has been successfully credited to your registered bank account. Thank you for your contribution!', signoff: 'Payroll Team, {{company_name}}', showPhoto: false, caption: '💰 Salary credited — {{company_name}}' },
  { cat: 'Payslip',             eventKey: 'payslip',         emoji: '🧾', art: 'document',    greeting: 'Your Payslip is Ready',                   subtitle: '',                                 body: 'Dear {{employee_name}}, your payslip is now available. Please log in to the employee portal to view and download it.', signoff: 'HR & Payroll, {{company_name}}', showPhoto: false, caption: '🧾 Payslip available — {{company_name}}' },
  { cat: 'Loan',                eventKey: 'loan',            emoji: '🏦', art: 'finance',     greeting: 'Loan Approved',                           subtitle: '',                                 body: 'Dear {{employee_name}}, we are pleased to inform you that your loan request has been approved. Please check the portal for details.', signoff: 'Finance Team, {{company_name}}', showPhoto: false, caption: '🏦 Loan approved — {{company_name}}' },
  { cat: 'Compliance',          eventKey: 'compliance',      emoji: '📋', art: 'notice',      greeting: 'Compliance Notice',                       subtitle: '',                                 body: 'Dear {{employee_name}}, this is an important compliance update from {{company_name}}. Please review the details on the portal.', signoff: 'Compliance Team, {{company_name}}', showPhoto: false, caption: '📋 Compliance notice — {{company_name}}' },
  { cat: 'Announcement',        eventKey: 'announcement',    emoji: '📢', art: 'notice',      greeting: 'Company Announcement',                    subtitle: '',                                 body: 'Dear Team, {{company_name}} has an important announcement. Please review the details shared on the employee portal.', signoff: '— {{company_name}}', showPhoto: false, caption: '📢 Announcement from {{company_name}}' },
  { cat: 'Custom',              eventKey: 'custom',          emoji: '🎉', art: 'celebration', greeting: 'A Message from {{company_name}}',          subtitle: '',                                 body: 'Dear {{employee_name}}, {{company_name}} wishes to share a special message with you today.', signoff: '— {{company_name}}', caption: '🎉 A message from {{company_name}}' },
];

// Build the portable design JSON (identical shape to communication_templates.layout).
const buildLayout = (style, def) => ({
  theme: { background: style.background, accent: style.accent, text: style.text, font: style.font, emoji: def.emoji, art: def.art, layoutKind: style.layoutKind },
  emoji: def.emoji, art: def.art, layoutKind: style.layoutKind,
  greetingTitle: def.greeting, subtitle: def.subtitle || '', signoff: def.signoff || 'Best wishes, {{company_name}}',
  showEmployeePhoto: def.showPhoto !== false, showCompanyLogo: true,
});

const mk = (def, style, sortOrder, festivalKey = '') => ({
  title: `${String(def.cat)} — ${style.styleName}`,
  category: def.cat,
  festivalKey,
  subject: def.greeting,
  body: def.body,
  placeholders: JSON.stringify(['{{employee_name}}', '{{company_name}}', '{{designation}}', '{{department}}', '{{years_completed}}']),
  layout: JSON.stringify(buildLayout(style, def)),
  whatsappCompatible: true,
  whatsappCaption: def.caption || '',
  status: 'Active',
  sortOrder,
});

/**
 * Generate the full master catalog (100+ templates).
 *  - 13 core categories × 5 styles = 65
 *  - 17 festivals × 2 styles      = 34   (category "Festival", festivalKey set)
 *  - Holiday generic × 5 styles   = 5
 *  Total ≈ 104.
 */
function generateMasterTemplates() {
  const out = [];
  let order = 0;

  // Core categories — 5 style variants each.
  for (const def of CATEGORIES) {
    for (const style of STYLES) out.push(mk(def, style, order++));
  }

  // Festivals — 2 distinct styles each (festive + royal gold), festivalKey set.
  const festStyles = [STYLES[0], STYLES[1]];
  for (const f of FESTIVALS) {
    for (const style of festStyles) {
      out.push(mk({
        cat: 'Festival', emoji: f.emoji, art: f.art,
        greeting: f.greeting, subtitle: '', body: f.wish,
        signoff: 'Warm wishes, {{company_name}}', showPhoto: false,
        caption: `${f.emoji} ${f.greeting} — {{company_name}}`,
      }, style, order++, f.slug));
    }
  }

  // Holiday — generic company holiday greetings, 5 styles.
  for (const style of STYLES) {
    out.push(mk({
      cat: 'Holiday', emoji: '🎊', art: 'celebration',
      greeting: 'Holiday Greetings', subtitle: '',
      body: 'Wishing you a joyful {{festival_name}} from all of us at {{company_name}}. Enjoy the celebrations!',
      signoff: 'Warm wishes, {{company_name}}', showPhoto: false,
      caption: '🎊 Holiday greetings from {{company_name}}',
    }, style, order++));
  }

  return out;
}

// Distinct category list (for the Master Library UI filter).
const MASTER_CATEGORIES = ['Birthday', 'Work Anniversary', 'Joining Anniversary', 'Promotion', 'Confirmation', 'Leave', 'Attendance', 'Payroll', 'Payslip', 'Loan', 'Compliance', 'Festival', 'Holiday', 'Announcement', 'Custom'];

module.exports = { generateMasterTemplates, MASTER_CATEGORIES, CATEGORIES };
