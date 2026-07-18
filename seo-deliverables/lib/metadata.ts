/**
 * metadata.ts — Next.js Metadata builder for ZeniaHR public pages.
 *
 * Every page gets: unique Title, Description, Canonical, Robots, OpenGraph and
 * Twitter Card — derived from the central PAGES registry so nothing drifts.
 *
 * Usage (Next.js App Router, per route file):
 *   export const metadata = buildMetadata('/pricing');
 * or, dynamically:
 *   export function generateMetadata() { return buildMetadata('/blog'); }
 */
import type { Metadata } from 'next';
import { SITE, KEYWORDS, canonical, getPage, type PageMeta } from './seo.config';

interface Overrides {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
  keywords?: string[];
}

export function buildMetadata(pathOrOverrides: string | Overrides, extra?: Overrides): Metadata {
  const o: Overrides = typeof pathOrOverrides === 'string' ? { path: pathOrOverrides, ...extra } : pathOrOverrides;
  const path = o.path ?? '/';
  const page: PageMeta | undefined = getPage(path);

  const title = o.title ?? page?.title ?? SITE.defaultTitle;
  const description = o.description ?? page?.description ?? SITE.defaultDescription;
  const url = canonical(path);
  const image = o.image ?? SITE.ogImage;
  const index = !(o.noindex || page?.indexable === false);
  const keywords = o.keywords ?? page?.keywords ?? [...KEYWORDS];

  return {
    metadataBase: new URL(SITE.url),
    title,
    description,
    keywords,
    applicationName: SITE.name,
    alternates: { canonical: url },
    robots: index
      ? {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      title,
      description,
      url,
      locale: SITE.locale,
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} — ${title}` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitter,
      creator: SITE.twitter,
      title,
      description,
      images: [image],
    },
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      ],
      shortcut: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/site.webmanifest',
  };
}
