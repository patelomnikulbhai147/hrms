/**
 * app/sitemap.ts — Next.js App Router dynamic sitemap.
 * Served at https://zeniahr.com/sitemap.xml
 *
 * Auto-includes every page in the PAGES registry, so future public pages appear
 * simply by being added to seo.config.ts. Dynamic collections (e.g. blog posts)
 * can be appended by fetching them below.
 */
import type { MetadataRoute } from 'next';
import { SITE, PAGES, canonical } from '../lib/seo.config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = PAGES.filter(
    (p) => p.indexable !== false,
  ).map((p) => ({
    url: canonical(p.path),
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // --- OPTIONAL: append dynamic blog posts (auto-includes future content) ----
  // let posts: MetadataRoute.Sitemap = [];
  // try {
  //   const data = await fetch(`${SITE.url}/api/posts`, { next: { revalidate: 3600 } }).then(r => r.json());
  //   posts = data.map((post: { slug: string; updatedAt: string }) => ({
  //     url: canonical(`/blog/${post.slug}`),
  //     lastModified: new Date(post.updatedAt),
  //     changeFrequency: 'weekly' as const,
  //     priority: 0.6,
  //   }));
  // } catch { /* keep static entries even if the CMS is unreachable */ }
  // return [...staticEntries, ...posts];

  return staticEntries;
}
