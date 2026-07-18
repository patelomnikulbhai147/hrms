/**
 * schema.ts — JSON-LD structured data for ZeniaHR.
 *
 * Emit these with a <script type="application/ld+json"> tag. In Next.js App
 * Router the idiomatic way is:
 *
 *   <script type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }} />
 *
 * Put Organization + WebSite + SoftwareApplication in app/layout.tsx (site-wide),
 * BreadcrumbList per page, and FAQPage only on pages that render an FAQ.
 */
import { SITE, canonical } from './seo.config';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: SITE.logo,
    sameAs: [
      // Fill in real profiles:
      // 'https://www.linkedin.com/company/zeniahr',
      // 'https://twitter.com/zeniahr',
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        url: `${SITE.url}/contact`,
        availableLanguage: ['en'],
      },
    ],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    publisher: { '@type': 'Organization', name: SITE.name, logo: SITE.logo },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE.url}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/** SoftwareApplication — describes the ZeniaHR product itself. */
export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'HRMS Software',
    operatingSystem: 'Web, Cloud, iOS, Android',
    url: SITE.url,
    description: SITE.defaultDescription,
    image: SITE.logo,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
      url: `${SITE.url}/pricing`,
      description: 'Free demo available. See pricing for plans.',
    },
    featureList: [
      'Payroll Software & Payroll Automation',
      'Attendance Management & Biometric Attendance',
      'Leave Management',
      'Recruitment Software',
      'Performance Management',
      'Asset Management',
      'Employee Self Service',
      'HR Automation',
    ],
  };
}

/** BreadcrumbList — pass an ordered [{ name, path }] trail. */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: canonical(c.path),
    })),
  };
}

/** FAQPage — render only where an FAQ is actually shown on the page. */
export function faqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** Convenience: serialize any schema object for injection. */
export const jsonLd = (data: unknown) => JSON.stringify(data);
