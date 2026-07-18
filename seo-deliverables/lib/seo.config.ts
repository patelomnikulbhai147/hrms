/**
 * seo.config.ts — single source of truth for ZeniaHR public-site SEO.
 *
 * Belongs in the zeniahr.com MARKETING repo (Next.js). Every other SEO helper
 * (metadata.ts, schema.ts, sitemap.ts, robots.ts) reads from here, so adding a
 * new public page = adding ONE entry to PAGES and it is automatically picked up
 * by the sitemap, canonical URLs and breadcrumbs.
 */

export const SITE = {
  name: 'ZeniaHR',
  legalName: 'ZeniaHR',
  url: 'https://zeniahr.com',
  // The app lives on a separate host and is intentionally NOT indexed.
  appUrl: 'https://admin.zeniahr.com',
  locale: 'en_US',
  twitter: '@zeniahr', // update if the handle differs
  logo: 'https://zeniahr.com/logo.png', // 512x512+ PNG, used by OG + Organization
  ogImage: 'https://zeniahr.com/og/zeniahr-og.png', // 1200x630
  themeColor: '#6C3CF0',
  defaultTitle:
    'ZeniaHR | HRMS Software | Payroll, Attendance, Leave & Employee Management',
  defaultDescription:
    'ZeniaHR is a cloud HRMS platform offering Payroll, Attendance, Leave Management, Recruitment, Employee Self Service, Performance Management, Asset Management and HR Automation.',
} as const;

/** Keywords — used naturally in copy AND surfaced in metadata. */
export const KEYWORDS = [
  'HRMS Software',
  'HR Software',
  'Payroll Software',
  'Attendance Management',
  'Leave Management',
  'Employee Management',
  'Recruitment Software',
  'Human Resource Management',
  'Workforce Management',
  'Employee Self Service',
  'Biometric Attendance',
  'Payroll Automation',
  'HR Software India',
  'Cloud HRMS',
  'Best HRMS Software',
  'Performance Management',
  'Manpower Management',
  'HR Automation',
] as const;

export type ChangeFreq =
  | 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface PageMeta {
  /** Route path, leading slash. '' = home ('/'). */
  path: string;
  title: string;
  description: string;
  priority: number;         // 0.0 – 1.0
  changeFrequency: ChangeFreq;
  keywords?: string[];      // page-specific emphasis (falls back to KEYWORDS)
  indexable?: boolean;      // default true; set false to keep out of sitemap/index
}

/**
 * Every PUBLIC page. Add a page here and the sitemap, canonicals and metadata
 * pick it up automatically. Product pages weave the target keywords into copy.
 */
export const PAGES: PageMeta[] = [
  {
    path: '/',
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    priority: 1.0,
    changeFrequency: 'weekly',
  },
  {
    path: '/features',
    title: 'Features | Cloud HRMS Software for Every HR Workflow | ZeniaHR',
    description:
      'Explore ZeniaHR features: Payroll Automation, Biometric Attendance, Leave Management, Recruitment, Performance Management, Asset Management and Employee Self Service in one cloud HRMS.',
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    path: '/pricing',
    title: 'Pricing | Affordable HRMS & Payroll Software | ZeniaHR',
    description:
      'Simple, transparent pricing for ZeniaHR — the best HRMS software for growing teams. Payroll, attendance and HR automation that scales with your workforce.',
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    path: '/payroll',
    title: 'Payroll Software | Automated Payroll & Compliance | ZeniaHR',
    description:
      'ZeniaHR Payroll Software automates salary processing, statutory compliance and payslips. Payroll automation that removes manual errors for HR and finance teams.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Payroll Software', 'Payroll Automation', 'HR Automation'],
  },
  {
    path: '/attendance',
    title: 'Attendance Management | Biometric Attendance Software | ZeniaHR',
    description:
      'Track workforce attendance in real time with ZeniaHR. Biometric attendance, shift management and geo-based check-in feed straight into payroll.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Attendance Management', 'Biometric Attendance', 'Workforce Management'],
  },
  {
    path: '/leave-management',
    title: 'Leave Management Software | Online Leave & Approvals | ZeniaHR',
    description:
      'Automate leave requests, approvals, balances and policies with ZeniaHR Leave Management. Give employees self-service leave and managers instant visibility.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Leave Management', 'Employee Self Service', 'HR Software'],
  },
  {
    path: '/recruitment',
    title: 'Recruitment Software | Applicant Tracking & Hiring | ZeniaHR',
    description:
      'Hire faster with ZeniaHR Recruitment Software — job posting, applicant tracking, interviews and offers in one HR platform.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Recruitment Software', 'Human Resource Management'],
  },
  {
    path: '/performance',
    title: 'Performance Management Software | Reviews & Goals | ZeniaHR',
    description:
      'Run appraisals, OKRs and continuous feedback with ZeniaHR Performance Management. Align goals and grow your workforce.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Performance Management', 'Workforce Management'],
  },
  {
    path: '/asset-management',
    title: 'Asset Management | Employee Asset Tracking | ZeniaHR',
    description:
      'Track company assets assigned to employees — laptops, devices and equipment — with ZeniaHR Asset Management, integrated with your HRMS.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Asset Management', 'Employee Management'],
  },
  {
    path: '/employee-self-service',
    title: 'Employee Self Service Portal | ESS Software | ZeniaHR',
    description:
      'Empower employees with the ZeniaHR Employee Self Service portal — payslips, leave, attendance, documents and profile updates, anytime.',
    priority: 0.8,
    changeFrequency: 'monthly',
    keywords: ['Employee Self Service', 'Employee Management'],
  },
  {
    path: '/about',
    title: 'About ZeniaHR | Cloud HRMS & HR Automation Platform',
    description:
      'Learn about ZeniaHR — a cloud HRMS platform helping companies automate HR, payroll and workforce management.',
    priority: 0.6,
    changeFrequency: 'monthly',
  },
  {
    path: '/contact',
    title: 'Contact ZeniaHR | Talk to Our HRMS Experts',
    description:
      'Get in touch with ZeniaHR for a demo of our HRMS, payroll and attendance software. We are here to help your HR team.',
    priority: 0.6,
    changeFrequency: 'monthly',
  },
  {
    path: '/blog',
    title: 'HR Blog | HRMS, Payroll & Workforce Insights | ZeniaHR',
    description:
      'Insights on HR software, payroll automation, attendance, compliance and workforce management from the ZeniaHR team.',
    priority: 0.7,
    changeFrequency: 'daily',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | ZeniaHR',
    description:
      'How ZeniaHR collects, uses and protects your data across our HRMS platform.',
    priority: 0.3,
    changeFrequency: 'yearly',
  },
  {
    path: '/terms',
    title: 'Terms of Service | ZeniaHR',
    description: 'The terms governing use of the ZeniaHR HRMS platform and website.',
    priority: 0.3,
    changeFrequency: 'yearly',
  },
];

/** Canonical URL builder — always absolute, no trailing slash except root. */
export function canonical(path: string): string {
  if (!path || path === '/') return SITE.url;
  return `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`.replace(/\/$/, '');
}

export function getPage(path: string): PageMeta | undefined {
  const norm = path === '' ? '/' : path;
  return PAGES.find((p) => p.path === norm);
}
