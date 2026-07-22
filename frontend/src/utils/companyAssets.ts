// ─────────────────────────────────────────────────────────────────────────────
// Lazy branding artwork.
//
// GET /companies used to carry every company's seal, letterhead and signature —
// measured at 95% of a 5.5 MB response, re-fetched on every login AND every
// workspace switch, purely so that a handful of document-rendering screens could
// read `company.stampImage` off an object they already had.
//
// The server now omits those three fields from the list and serves them from
// /companies/:id/assets. Rather than rewire the ~30 places that read them, this
// module fetches the artwork for ONE company and merges it back into the company
// object held in App state. Every existing call site keeps working untouched;
// they simply see the fields appear a moment after login instead of blocking it.
//
// Two guarantees callers rely on:
//   • cached — a company's artwork is fetched at most once per session;
//   • de-duplicated — concurrent callers share one in-flight request.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from '@/api/apiClient';

export interface CompanyAssets {
  stampImage?: string | null;
  letterheadImage?: string | null;
  digitalSignatureImage?: string | null;
}

const cache = new Map<string, CompanyAssets>();
const inflight = new Map<string, Promise<CompanyAssets>>();

/** Artwork already resolved for this company, or null if it has not loaded yet. */
export const peekCompanyAssets = (id: string | number): CompanyAssets | null =>
  cache.get(String(id)) ?? null;

/**
 * Fetch (once) the heavy branding artwork for a company.
 * Never rejects: a company with no artwork, a 403, or an offline blip all resolve
 * to an empty object, because a missing seal must degrade to "no seal on the
 * printout", never to a crashed report screen.
 */
export function ensureCompanyAssets(id: string | number | null | undefined): Promise<CompanyAssets> {
  const key = String(id ?? '');
  if (!key || key === 'undefined' || key === 'null') return Promise.resolve({});
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running;

  const p = api.companies.getAssets(key)
    .then((r: any) => {
      const assets: CompanyAssets = {
        stampImage: r?.stampImage ?? null,
        letterheadImage: r?.letterheadImage ?? null,
        digitalSignatureImage: r?.digitalSignatureImage ?? null,
      };
      cache.set(key, assets);
      return assets;
    })
    .catch(() => {
      // Cache the failure too. Retrying on every render of a report screen would
      // turn one bad response into a request storm.
      const empty: CompanyAssets = {};
      cache.set(key, empty);
      return empty;
    })
    .finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

/** Drop cached artwork so the next read re-fetches (used after a branding save). */
export const invalidateCompanyAssets = (id?: string | number) => {
  if (id == null) { cache.clear(); return; }
  cache.delete(String(id));
};

/**
 * Merge freshly-loaded artwork into a company list. A branch inherits its parent
 * company's artwork, which is what the server resolves for a branch id too, so
 * both the branch entry and its parent receive the same images.
 */
export function mergeAssetsInto<T extends { id: any; parentCompanyId?: any }>(
  companies: T[], id: string | number, assets: CompanyAssets,
): T[] {
  const key = String(id);
  return companies.map((c) =>
    String(c.id) === key || String((c as any).parentCompanyId ?? '') === key
      ? { ...c, ...assets }
      : c,
  );
}
