/**
 * app/robots.ts — Next.js App Router robots.txt for the PUBLIC site.
 * Served at https://zeniahr.com/robots.txt
 *
 * Public marketing pages are crawlable; app/auth areas are disallowed. The
 * private app host (admin.zeniahr.com) blocks everything via its OWN robots.txt
 * + noindex header (that host is a different deployment).
 */
import type { MetadataRoute } from 'next';
import { SITE } from '../lib/seo.config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Never index auth/app/portal routes even if they appear on the public host.
        disallow: [
          '/api/',
          '/login',
          '/signin',
          '/signup',
          '/dashboard',
          '/admin',
          '/employee-portal',
          '/superadmin',
          '/account',
          '/*?*', // avoid crawling infinite query-string permutations
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
