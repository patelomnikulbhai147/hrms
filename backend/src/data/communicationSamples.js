/**
 * Communication Center — Enterprise sample library (Phase 1).
 *
 * A read-only catalog of professionally designed SAMPLE greeting templates and a
 * curated set of major Indian holidays. Nothing here is delivered or sent —
 * samples are for preview/duplication and the holidays are an importable starter
 * list.
 *
 * Each sample carries a portable DESIGN spec rendered as a real greeting card by
 * the frontend (no heavy base64 images shipped):
 *   theme.background  — CSS gradient
 *   theme.accent/text — palette
 *   theme.art         — decoration set (balloons / diya / rangoli / snow / …)
 *   theme.layoutKind  — one of 5 STRUCTURALLY DISTINCT layouts (not recolors)
 *   theme.font        — display font family
 * The whole theme is stored inside the template `layout` JSON when duplicated, so
 * a copy keeps its look with NO schema change, and it is future-proof for
 * Email / WhatsApp / In-App / Push rendering in Phase 2.
 */

// Five DISTINCT structural layouts + matching palette. Index i of a set always
// pairs a unique layout with a unique palette, so the 5 variants of any occasion
// are genuinely different designs — never recolored copies of one layout.
const STYLES = [
  { key: 'festive',  styleName: 'Festive',   layoutKind: 'banner',  background: 'linear-gradient(135deg,#7c2d12 0%,#b91c1c 45%,#f59e0b 100%)', accent: '#fde68a', text: '#fff7ed', font: "'Georgia', serif" },
  { key: 'golden',   styleName: 'Royal Gold',layoutKind: 'frame',   background: 'linear-gradient(135deg,#5b4209 0%,#b8860b 55%,#f5d77a 100%)', accent: '#fffbe6', text: '#fffdf5', font: "'Playfair Display','Georgia',serif" },
  { key: 'modern',   styleName: 'Modern',    layoutKind: 'sidebar', background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#334155 100%)', accent: '#22d3ee', text: '#f8fafc', font: "'Trebuchet MS',sans-serif" },
  { key: 'vibrant',  styleName: 'Vibrant',   layoutKind: 'split',   background: 'linear-gradient(135deg,#6d28d9 0%,#db2777 100%)', accent: '#fde047', text: '#ffffff', font: "'Verdana',sans-serif" },
  { key: 'elegant',  styleName: 'Elegant',   layoutKind: 'classic', background: 'linear-gradient(135deg,#ecfeff 0%,#e0e7ff 100%)', accent: '#4f46e5', text: '#1e293b', font: "'Garamond','Georgia',serif" },
];

const PLACEHOLDER_HINTS = ['{{employee_name}}', '{{employee_photo}}', '{{company_logo}}', '{{company_name}}', '{{designation}}'];

function sample({ key, category, title, styleName, festivalName, emoji, art, greetingTitle, subtitle, body, signoff, showPhoto, style }) {
  return {
    key, category, title, styleName,
    festivalName: festivalName || null,
    emoji, art,
    greetingTitle,
    subtitle: subtitle || '',
    body,
    signoff: signoff || 'Best wishes, {{company_name}}',
    showEmployeePhoto: showPhoto !== false,
    showCompanyLogo: true,
    placeholders: PLACEHOLDER_HINTS,
    layoutKind: style.layoutKind,
    theme: { background: style.background, accent: style.accent, text: style.text, emoji, art, layoutKind: style.layoutKind, font: style.font },
  };
}

// Build the 5 styled variants for an occasion. `names` optionally overrides the
// 5 variant titles (e.g. the specific Birthday names from the spec).
function buildSet({ slug, category, occasion, emoji, art, festivalName, greetingTitle, subtitle, body, signoff, showPhoto, names }) {
  return STYLES.map((style, i) => sample({
    key: `${slug}-${style.key}`,
    category,
    title: (names && names[i]) || `${occasion} — ${style.styleName}`,
    styleName: style.styleName,
    festivalName, emoji, art, greetingTitle, subtitle, body, signoff, showPhoto, style,
  }));
}

// ── Personal occasions ────────────────────────────────────────────────────────
const BIRTHDAY = buildSet({
  slug: 'birthday', category: 'Birthday Wishes', occasion: 'Birthday', emoji: '🎂', art: 'birthday',
  greetingTitle: 'Happy Birthday!', subtitle: '{{designation}}',
  body: 'Wishing you happiness, success and good health on your special day. Thank you for being a wonderful part of our team!',
  signoff: '— {{company_name}}',
  names: ['Birthday Balloons', 'Golden Celebration', 'Modern Birthday', 'Confetti Pop', 'Elegant Birthday'],
});

const ANNIVERSARY = buildSet({
  slug: 'anniversary', category: 'Work Anniversary', occasion: 'Work Anniversary', emoji: '🏆', art: 'anniversary',
  greetingTitle: 'Happy Work Anniversary!', subtitle: '{{years_of_service}} years with us',
  body: 'Congratulations on another remarkable year with {{company_name}}. Your dedication inspires us all. Here is to many more milestones together!',
  signoff: 'With gratitude, {{company_name}}',
  names: ['Milestone Ribbon', 'Gold Achievement', 'Modern Milestone', 'Celebration Burst', 'Elegant Anniversary'],
});

const WELCOME = buildSet({
  slug: 'welcome', category: 'Welcome Messages', occasion: 'Welcome', emoji: '👋', art: 'welcome',
  greetingTitle: 'Welcome Aboard!', subtitle: '{{designation}} · {{department}}',
  body: 'The entire {{company_name}} family is delighted to have you with us. We look forward to achieving great things together. Welcome to the team!',
  signoff: 'Warm regards, {{company_name}}',
  names: ['Warm Welcome', 'Golden Welcome', 'Modern Onboarding', 'Confetti Welcome', 'Elegant Welcome'],
});

const FAREWELL = buildSet({
  slug: 'farewell', category: 'Farewell Messages', occasion: 'Farewell', emoji: '💐', art: 'farewell',
  greetingTitle: 'Farewell & Best Wishes', subtitle: '{{designation}}',
  body: 'Thank you for your valuable contributions to {{company_name}}. We wish you the very best in your next chapter. You will truly be missed!',
  signoff: 'With appreciation, {{company_name}}',
  names: ['Floral Farewell', 'Golden Goodbye', 'Modern Farewell', 'Heartfelt Farewell', 'Elegant Farewell'],
});

const PROMOTION = buildSet({
  slug: 'promotion', category: 'Promotion Congratulations', occasion: 'Promotion', emoji: '🚀', art: 'promotion',
  greetingTitle: 'Congratulations on Your Promotion!', subtitle: 'Promoted to {{designation}}',
  body: 'Your hard work and commitment have earned you this well-deserved promotion. {{company_name}} is proud of your achievement. Onward and upward!',
  signoff: 'Cheers, {{company_name}}',
  names: ['Rising Star', 'Golden Promotion', 'Modern Promotion', 'Celebration Promotion', 'Elegant Promotion'],
});

const EOTM = buildSet({
  slug: 'eotm', category: 'Employee of the Month', occasion: 'Employee of the Month', emoji: '⭐', art: 'award',
  greetingTitle: 'Employee of the Month', subtitle: '{{designation}} · {{department}}',
  body: 'In recognition of outstanding performance and dedication, {{company_name}} is proud to honour you as Employee of the Month. Congratulations!',
  signoff: 'Proudly, {{company_name}}',
  names: ['Spotlight Award', 'Gold Star Award', 'Modern Recognition', 'Star Performer', 'Elegant Award'],
});

const SALARY = buildSet({
  slug: 'salary', category: 'Salary Credited', occasion: 'Salary Credited', emoji: '💰', art: 'finance',
  greetingTitle: 'Salary Credited', subtitle: '{{today_date}}',
  body: 'Dear {{employee_name}}, your salary for this month has been successfully credited to your registered bank account. Thank you for your continued contribution.',
  signoff: 'Payroll Team, {{company_name}}', showPhoto: false,
  names: ['Salary Notice', 'Gold Finance', 'Modern Payroll', 'Bright Finance', 'Elegant Salary'],
});

const PAYSLIP = buildSet({
  slug: 'payslip', category: 'Payslip Available', occasion: 'Payslip', emoji: '🧾', art: 'document',
  greetingTitle: 'Your Payslip is Ready', subtitle: '{{today_date}}',
  body: 'Dear {{employee_name}}, your payslip for this month is now available. Please log in to the employee portal to view and download it.',
  signoff: 'HR & Payroll, {{company_name}}', showPhoto: false,
  names: ['Payslip Notice', 'Gold Payslip', 'Modern Payslip', 'Bright Payslip', 'Elegant Payslip'],
});

// Company Announcements — 5 distinct purposes, each a distinct layout/art.
const ANNOUNCEMENTS = STYLES.map((style, i) => {
  const defs = [
    { key: 'office-closed', title: 'Office Closed', emoji: '🏢', art: 'notice', greeting: 'Office Closed', body: 'Please note that the {{company_name}} office will remain closed on [date] on account of [reason]. Normal operations resume the next working day.' },
    { key: 'policy', title: 'New Policy Update', emoji: '📋', art: 'notice', greeting: 'Policy Update', body: 'Dear Team, {{company_name}} has updated its [policy name], effective [date]. Please review the details on the employee portal.' },
    { key: 'meeting', title: 'Meeting Announcement', emoji: '📅', art: 'notice', greeting: 'Meeting Scheduled', body: 'A [meeting type] meeting is scheduled on [date] at [time] in [venue]. Your presence is requested.' },
    { key: 'event', title: 'Event Invitation', emoji: '🎊', art: 'celebration', greeting: 'You are Invited!', body: 'Dear {{employee_name}}, you are cordially invited to [event name] on [date] at [venue]. We look forward to celebrating with you!' },
    { key: 'notice', title: 'General Notice', emoji: '📢', art: 'notice', greeting: 'General Notice', body: 'Dear Team, please be informed that [details]. For any queries, kindly contact the HR department.' },
  ];
  const d = defs[i];
  return sample({ key: `ann-${d.key}`, category: 'Company Announcements', title: d.title, styleName: style.styleName, emoji: d.emoji, art: d.art, greetingTitle: d.greeting, subtitle: '', body: d.body, signoff: '— {{company_name}}', showPhoto: false, style });
});

// ── Festivals — 5 distinct layouts each, festival-specific artwork ────────────
const FESTIVALS = [
  { slug: 'diwali',        name: 'Diwali',            emoji: '🪔', art: 'diwali',       greeting: 'Happy Diwali!',           wish: 'May the festival of lights brighten your life with happiness, prosperity and success.', variants: ['Classic Diwali', 'Golden Diwali', 'Modern Corporate Diwali', 'Vibrant Diwali', 'Minimal Diwali'] },
  { slug: 'holi',          name: 'Holi',              emoji: '🎨', art: 'holi',         greeting: 'Happy Holi!',             wish: 'May your life be as colourful and joyful as the festival of Holi. Best wishes to you and your family!' },
  { slug: 'eid',           name: 'Eid',               emoji: '🌙', art: 'eid',          greeting: 'Eid Mubarak!',            wish: 'Wishing you and your family peace, happiness and prosperity on this blessed occasion.' },
  { slug: 'christmas',     name: 'Christmas',         emoji: '🎄', art: 'christmas',    greeting: 'Merry Christmas!',        wish: 'May this Christmas fill your heart with warmth and your home with joy. Season\'s greetings!' },
  { slug: 'new-year',      name: 'New Year',          emoji: '🎆', art: 'newyear',      greeting: 'Happy New Year!',         wish: 'Wishing you a year full of new opportunities, growth and success. Happy New Year!' },
  { slug: 'independence',  name: 'Independence Day',  emoji: '🇮🇳', art: 'tricolor',     greeting: 'Happy Independence Day!', wish: 'Let us celebrate the spirit of freedom and unity. Proud to be Indian. Jai Hind!' },
  { slug: 'republic',      name: 'Republic Day',      emoji: '🇮🇳', art: 'tricolor',     greeting: 'Happy Republic Day!',     wish: 'Saluting the spirit of our great nation on this proud day. Jai Hind!' },
  { slug: 'navratri',      name: 'Navratri',          emoji: '🪕', art: 'navratri',     greeting: 'Happy Navratri!',         wish: 'May the divine blessings of Maa Durga bring you strength, joy and prosperity.' },
  { slug: 'rakshabandhan', name: 'Raksha Bandhan',    emoji: '🪢', art: 'rakhi',        greeting: 'Happy Raksha Bandhan!',   wish: 'Celebrating the beautiful bond of love and protection. Happy Raksha Bandhan!' },
  { slug: 'janmashtami',   name: 'Janmashtami',       emoji: '🦚', art: 'janmashtami',  greeting: 'Happy Janmashtami!',      wish: 'May Lord Krishna bless you with happiness, peace and good fortune.' },
  { slug: 'ganesh',        name: 'Ganesh Chaturthi',  emoji: '🐘', art: 'ganesh',       greeting: 'Happy Ganesh Chaturthi!', wish: 'May Lord Ganesha remove all obstacles and bless you with wisdom and prosperity.' },
  { slug: 'sankranti',     name: 'Makar Sankranti',   emoji: '🪁', art: 'kite',         greeting: 'Happy Makar Sankranti!',  wish: 'May your life soar high like a kite, full of joy and success. Happy Uttarayan!' },
  { slug: 'shivratri',     name: 'Mahashivratri',     emoji: '🔱', art: 'shivratri',    greeting: 'Happy Mahashivratri!',    wish: 'May Lord Shiva bless you with peace, strength and prosperity. Har Har Mahadev!' },
  { slug: 'womens-day',    name: "Women's Day",       emoji: '💜', art: 'womensday',    greeting: "Happy Women's Day!",      wish: 'Celebrating the strength, grace and achievements of women everywhere.' },
  { slug: 'labour-day',    name: 'Labour Day',        emoji: '🛠️', art: 'labour',       greeting: 'Happy Labour Day!',       wish: 'Honouring the hard work and dedication of every worker. Happy Labour Day!' },
  { slug: 'mothers-day',   name: "Mother's Day",      emoji: '🌷', art: 'flowers',      greeting: "Happy Mother's Day!",     wish: 'Celebrating the love, warmth and sacrifice of every mother. Happy Mother\'s Day!' },
  { slug: 'fathers-day',   name: "Father's Day",      emoji: '👔', art: 'formal',       greeting: "Happy Father's Day!",     wish: 'Honouring the strength, wisdom and guidance of every father. Happy Father\'s Day!' },
];

const FESTIVAL_TEMPLATES = FESTIVALS.flatMap((f) => buildSet({
  slug: `fest-${f.slug}`,
  category: 'Festival Greetings',
  occasion: f.name,
  emoji: f.emoji,
  art: f.art,
  festivalName: f.name,
  greetingTitle: f.greeting,
  subtitle: '',
  body: f.wish,
  signoff: 'Warm wishes, {{company_name}}',
  showPhoto: false,
  names: f.variants ? f.variants : STYLES.map(s => `${f.name} — ${s.styleName}`),
}));

const SAMPLE_TEMPLATES = [
  ...BIRTHDAY, ...ANNIVERSARY, ...FESTIVAL_TEMPLATES, ...ANNOUNCEMENTS,
  ...WELCOME, ...FAREWELL, ...PROMOTION, ...EOTM, ...SALARY, ...PAYSLIP,
];

// ── Sample holidays — major Indian holidays (importable starter list) ─────────
function sampleHolidays(year) {
  const y = Number(year) || new Date().getFullYear();
  const H = (name, date, category, opts = {}) => ({
    name, date: `${y}-${date}`, category,
    isPublicHoliday: opts.optional ? false : true,
    isOptionalHoliday: !!opts.optional,
    isRecurring: true,
    description: opts.description || `${name} holiday`,
  });
  return [
    H('New Year\'s Day', '01-01', 'National'),
    H('Makar Sankranti / Uttarayan', '01-14', 'Religious'),
    H('Republic Day', '01-26', 'National'),
    H('Maha Shivratri', '02-26', 'Religious'),
    H('Holi', '03-14', 'Religious'),
    H('Eid al-Fitr', '03-31', 'Religious', { optional: true }),
    H('Ram Navami', '04-06', 'Religious', { optional: true }),
    H('Good Friday', '04-18', 'Religious', { optional: true }),
    H('Labour Day', '05-01', 'National'),
    H('Independence Day', '08-15', 'National'),
    H('Raksha Bandhan', '08-09', 'Religious', { optional: true }),
    H('Janmashtami', '08-16', 'Religious', { optional: true }),
    H('Ganesh Chaturthi', '08-27', 'Religious', { optional: true }),
    H('Gandhi Jayanti', '10-02', 'National'),
    H('Dussehra', '10-02', 'Religious'),
    H('Diwali', '10-20', 'Religious'),
    H('Christmas', '12-25', 'Religious'),
  ];
}

module.exports = { SAMPLE_TEMPLATES, sampleHolidays, STYLES, FESTIVALS };
