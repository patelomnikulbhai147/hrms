# ZeniaHR SEO — deliverables

## ⚠️ Read this first — architecture reality

The SEO request assumed **one Next.js app**. In fact ZeniaHR is **two separate deployments**:

| Host | What it is | Repo | SEO goal |
|------|-----------|------|----------|
| **zeniahr.com / www.zeniahr.com** | Public **marketing website** | Served by **AWS CloudFront** — a **separate project, NOT this repo** | **Indexable** — sitemap, metadata, JSON-LD, OG |
| **admin.zeniahr.com** | The **HRMS application** (login, dashboard, portals) | **THIS repo** (Vite + React 19 SPA — there is no Next.js here) | **Blocked from indexing** (your requirements #2 & #11) |

Because of this split:

- **This repo cannot host the marketing sitemap/metadata** — those public pages
  (`/about`, `/features`, `/pricing`, `/payroll`, …) do not exist here, and there
  is no Next.js to run `app/sitemap.ts`.
- The correct SEO action **for this repo** was to guarantee the app is never
  indexed — done, see "Applied to this repo" below.
- The files in this folder are the **ready-to-use marketing-site SEO kit**. Drop
  them into the **zeniahr.com marketing repo**. They are quarantined here (outside
  `frontend/src`) so they never affect the HRMS app build.

---

## ✅ Applied to THIS repo (admin.zeniahr.com) — live-safe, no logic touched

- `public/robots.txt` → `Disallow: /` (blocks all crawling of the app host).
- `index.html` → `<meta name="robots" content="noindex, nofollow">` (+ googlebot).
- Recommended nginx header on the `admin.zeniahr.com` server block:
  `add_header X-Robots-Tag "noindex, nofollow" always;`  (belt-and-suspenders).
- Favicon / app icons already present in `public/` (favicon.svg, .ico, PNGs,
  apple-touch-icon, webmanifest).

---

## 📦 Marketing-site kit (put in the zeniahr.com repo)

### If the marketing site is **Next.js (App Router)**
```
lib/seo.config.ts        → single source of truth (pages, keywords, canonicals)
lib/metadata.ts          → buildMetadata('/path') → Title/Desc/Canonical/Robots/OG/Twitter
lib/schema.ts            → Organization / WebSite / SoftwareApplication / BreadcrumbList / FAQPage
app/sitemap.ts           → dynamic /sitemap.xml (auto-includes future pages)
app/robots.ts            → /robots.txt (allow public, disallow app/auth, Sitemap:)
app/layout.example.tsx   → wire site-wide metadata + JSON-LD (rename to app/layout.tsx)
app/page.example.tsx     → home metadata + Breadcrumb + FAQ example (rename to app/page.tsx)
```
Per route, add: `export const metadata = buildMetadata('/pricing')`. Adding a page
to `PAGES` in `seo.config.ts` auto-includes it in the sitemap and canonicals.

### If the marketing site is a **static site (plain CloudFront)**
```
static/robots.txt        → upload to site root as /robots.txt
static/sitemap.xml       → upload to site root as /sitemap.xml (keep <lastmod> fresh)
```
Add per-page `<title>`, `<meta name="description">`, `<link rel="canonical">`,
OG/Twitter tags and JSON-LD `<script type="application/ld+json">` to each HTML
page — the exact content is in `lib/seo.config.ts` and `lib/schema.ts`.

---

## Content included (matches the spec)
- **Home title:** `ZeniaHR | HRMS Software | Payroll, Attendance, Leave & Employee Management`
- **Home description:** the cloud-HRMS sentence, verbatim.
- **All 15 pages** with unique title + description + priority + change frequency.
- **18 target keywords** woven into page copy and metadata.
- **JSON-LD:** Organization, SoftwareApplication, WebSite, BreadcrumbList, FAQPage.
- **OG + Twitter cards** with logo/OG image, per page.
- **Canonicals** on every page; **noindex** for app/auth routes.

## Assets you must add to the marketing repo's `public/`
- `logo.png` (≥512×512, used by Organization + OG) — the ZeniaHR logo.
- `og/zeniahr-og.png` (1200×630) — social share image.
- Favicon set (reuse the files already in this repo's `public/`).
- Update `SITE.twitter` and Organization `sameAs` with real handles/profiles.

## Performance / Lighthouse (marketing repo)
- Use `next/image` (or `loading="lazy"` + width/height on raw `<img>`), preload
  only the LCP hero, self-host fonts with `next/font`, and keep JS minimal on
  marketing pages. Those pages are content-first, so SEO=100 and Perf>95 are
  very achievable once the above metadata + images are in place.

## Google Search Console
1. Verify **both** `zeniahr.com` and `admin.zeniahr.com` as properties.
2. For `zeniahr.com`: submit `https://zeniahr.com/sitemap.xml`.
3. For `admin.zeniahr.com`: confirm it reports "Excluded by 'noindex'" — that is
   the intended state.
