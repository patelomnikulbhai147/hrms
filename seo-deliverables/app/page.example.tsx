/**
 * page.example.tsx — home page metadata + per-page JSON-LD (Breadcrumb + FAQ).
 * Rename to app/page.tsx (merge with your existing home page component).
 *
 * Image SEO reminder: give EVERY <img>/<Image> a descriptive `alt`, set
 * width/height, and let below-the-fold images lazy-load (next/image does this
 * by default; add loading="lazy" to raw <img>). Mark only the LCP hero image
 * with priority / loading="eager".
 */
import { buildMetadata } from '../lib/metadata';
import { breadcrumbSchema, faqSchema, jsonLd } from '../lib/schema';

export const metadata = buildMetadata('/');

const FAQS = [
  {
    question: 'What is ZeniaHR?',
    answer:
      'ZeniaHR is a cloud HRMS software offering Payroll, Attendance Management, Leave Management, Recruitment, Performance Management, Asset Management and Employee Self Service in one platform.',
  },
  {
    question: 'Does ZeniaHR support biometric attendance and payroll automation?',
    answer:
      'Yes. ZeniaHR captures biometric attendance and automates payroll, statutory compliance and payslips end to end.',
  },
  {
    question: 'Is ZeniaHR suitable for companies in India?',
    answer:
      'Yes. ZeniaHR is a cloud HRMS built for HR software needs in India, including statutory payroll compliance and workforce management.',
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema([{ name: 'Home', path: '/' }])) }}
      />
      {/* Render this ONLY because the FAQ is actually shown on the page below. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(FAQS)) }} />

      {/* ... your existing home page UI (unchanged) ... */}
    </>
  );
}
