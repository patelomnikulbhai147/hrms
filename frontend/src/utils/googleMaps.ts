// ── Google Maps Platform integration helpers ─────────────────────────────────
// Loads the Google Maps JavaScript API (Maps + Places + Geocoding) once, and
// converts Google's raw geocode/place results into the structured, flat address
// shape the Company Profile form persists.
//
// Persistence is ZERO-SCHEMA: latitude, longitude and Place ID are encoded INSIDE
// the existing `googleMapLocation` URL column (query=lat,lng & query_place_id).
// The formatted address rebuilds from the address/city/state/pin fields that are
// already saved, so no new database columns are required.
//
// The API key is NOT a build-time secret. It is configured once by a Super Admin
// (installer) under System Settings → Third Party Integrations and fetched at
// runtime from the backend, so customers never touch .env / API keys. When no key
// is configured, `loadGoogleMaps()` rejects with code 'NOT_CONFIGURED' so the UI
// can show a clean "unavailable — contact administrator" state (never a raw error).

import { api } from '@/api/apiClient';

declare global {
  interface Window { google?: any; __hrmsGmapsInit?: () => void; }
}

/** Distinguishes "no key set" from a transient load failure, for clean UX. */
export class MapsNotConfiguredError extends Error {
  code = 'NOT_CONFIGURED';
  constructor() { super('Google Maps is not configured.'); }
}

let cachedKey: string | null = null;
let loaderPromise: Promise<any> | null = null;

/** Clear the cached key/loader (e.g. after an admin saves a new key). */
export function resetGoogleMaps() { cachedKey = null; loaderPromise = null; }

async function resolveKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  let cfg: any;
  try {
    cfg = await api.systemSettings.googleMaps.publicConfig();
  } catch (_) {
    throw new Error('LOAD_FAILED'); // backend/network issue — treat as temporary
  }
  if (!cfg?.configured || !cfg?.apiKey) throw new MapsNotConfiguredError();
  cachedKey = String(cfg.apiKey);
  return cachedKey;
}

/**
 * Loads the Google Maps JS API exactly once (idempotent). Resolves with
 * `window.google`. Rejects with `MapsNotConfiguredError` when no key is set, or a
 * generic Error('LOAD_FAILED') on a transient failure.
 */
export function loadGoogleMaps(): Promise<any> {
  if (typeof window !== 'undefined' && window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (loaderPromise) return loaderPromise;
  loaderPromise = (async () => {
    const key = await resolveKey();
    return await new Promise((resolve, reject) => {
      const cb = '__hrmsGmapsInit';
      window[cb] = () => resolve(window.google);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`
        + `&libraries=places&loading=async&callback=${cb}`;
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error('LOAD_FAILED'));
      document.head.appendChild(s);
    });
  })().catch((e) => { loaderPromise = null; throw e; });
  return loaderPromise;
}

// ── Structured location shape the form consumes ──────────────────────────────
export interface PickedLocation {
  businessName: string;   // Google place/business name when the pin is an establishment
  street: string;         // building no. + street (address line 1)
  area: string;           // locality / sublocality / neighborhood (address line 2)
  additional: string;     // floor / unit — subpremise (address line 3, if available)
  city: string;
  district: string;       // administrative_area_level_2 (informational; no form field)
  state: string;
  country: string;
  pincode: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string;
  mapUrl: string;         // canonical URL with lat,lng + place_id encoded
}

type Comp = { long_name: string; short_name: string; types: string[] };

const pick = (comps: Comp[], type: string, useShort = false): string => {
  const c = comps.find(x => x.types.includes(type));
  return c ? (useShort ? c.short_name : c.long_name) : '';
};
const firstOf = (comps: Comp[], types: string[], useShort = false): string => {
  for (const t of types) { const v = pick(comps, t, useShort); if (v) return v; }
  return '';
};

/** Loose check that a string is a Google Maps link (for the manual-entry fallback). */
export function isGoogleMapsUrl(url: string): boolean {
  const v = String(url || '').trim();
  if (!v) return false;
  return /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(v);
}

/** Build the canonical Google Maps URL that also stores lat,lng + Place ID. */
export function buildMapUrl(lat: number, lng: number, placeId?: string): string {
  const q = `${lat.toFixed(7)},${lng.toFixed(7)}`;
  let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if (placeId) url += `&query_place_id=${encodeURIComponent(placeId)}`;
  return url;
}

/**
 * Extract lat/lng (+ optional Place ID) from a previously-saved map URL so an
 * existing company reopens centered on its saved location. Handles the canonical
 * `query=lat,lng` form plus common legacy forms (`@lat,lng`, `q=`, `ll=`).
 */
export function parseMapUrl(url?: string | null): { lat: number; lng: number; placeId?: string } | null {
  const v = String(url || '').trim();
  if (!v) return null;
  let placeId: string | undefined;
  const pid = v.match(/query_place_id=([^&\s]+)/i);
  if (pid) { try { placeId = decodeURIComponent(pid[1]); } catch { placeId = pid[1]; } }

  const patterns = [
    /[?&]query=(-?\d+(?:\.\d+)?)[,%2C]+\s*(-?\d+(?:\.\d+)?)/i, // ?query=lat,lng (also %2C encoded)
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,                    // /@lat,lng,zoom
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,              // ?q=lat,lng
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,             // ?ll=lat,lng
  ];
  const decoded = v.replace(/%2C/gi, ',');
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, placeId };
    }
  }
  return null; // no coordinates recoverable from the URL
}

/** True when a place looks like a named business / point of interest (has a real name). */
function isEstablishment(place: any): boolean {
  const t: string[] = place?.types || [];
  return t.includes('establishment') || t.includes('point_of_interest') || t.includes('premise')
    || t.some(x => x.startsWith('store') || x === 'food' || x === 'company');
}

/** Convert Google address components + geometry into the flat `PickedLocation`. */
export function toPickedLocation(
  comps: Comp[],
  formattedAddress: string,
  lat: number,
  lng: number,
  placeId: string,
  businessName = '',
): PickedLocation {
  const streetNumber = pick(comps, 'street_number');
  const route = pick(comps, 'route');
  const premise = pick(comps, 'premise');       // building name (e.g. "Shivalik Business Center")
  const subpremise = pick(comps, 'subpremise'); // unit / floor
  const floor = pick(comps, 'floor');
  // Line 1: street number + building, or the route when there's no building.
  const street = [streetNumber, premise].filter(Boolean).join(', ') || route;
  // Line 2: locality/sublocality; when a building filled line 1, the route is the area.
  const area = firstOf(comps, [
    'neighborhood', 'sublocality_level_1', 'sublocality', 'sublocality_level_2',
  ]) || (premise ? route : '');
  // Line 3: floor / unit, when Google provides it.
  const additional = [subpremise, floor].filter(Boolean).join(', ');
  const city = firstOf(comps, [
    'locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2',
  ]);
  const district = firstOf(comps, ['administrative_area_level_2', 'administrative_area_level_3']);
  const state = pick(comps, 'administrative_area_level_1');
  const country = pick(comps, 'country');
  const pincode = pick(comps, 'postal_code');

  return {
    businessName: businessName || '',
    street: street || route || '',
    area,
    additional,
    city,
    district: district && district.toLowerCase() !== city.toLowerCase() ? district : '',
    state,
    country,
    pincode,
    formattedAddress: formattedAddress || '',
    lat,
    lng,
    placeId: placeId || '',
    mapUrl: buildMapUrl(lat, lng, placeId),
  };
}

/** Build a `PickedLocation` from a Places Autocomplete result (may carry a business name). */
export function fromPlace(place: any): PickedLocation | null {
  if (!place?.geometry?.location) return null;
  const loc = place.geometry.location;
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  const businessName = isEstablishment(place) ? (place.name || '') : '';
  return toPickedLocation(
    place.address_components || [],
    place.formatted_address || place.name || '',
    lat, lng, place.place_id || '', businessName,
  );
}
