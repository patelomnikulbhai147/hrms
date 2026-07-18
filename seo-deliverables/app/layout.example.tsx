/**
 * layout.example.tsx — how to wire site-wide SEO in the marketing repo.
 * Rename to app/layout.tsx (merge with your existing layout).
 *
 * - Default metadata (home) via buildMetadata (each page overrides its own).
 * - Site-wide JSON-LD: Organization + WebSite + SoftwareApplication.
 * - Favicon uses the company logo (icons declared in metadata).
 */
import type { ReactNode } from 'react';
import { buildMetadata } from '../lib/metadata';
import { organizationSchema, websiteSchema, softwareApplicationSchema, jsonLd } from '../lib/schema';

// Home/default metadata; child routes export their own `metadata = buildMetadata('/path')`.
export const metadata = buildMetadata('/');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Site-wide structured data */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationSchema()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteSchema()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareApplicationSchema()) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
