// ── System Settings → Third Party Integrations ───────────────────────────────
// Global, installation-wide integration configuration managed ONLY by a Super
// Admin (the installer). Currently: Google Maps. Stored via the file-backed
// integrationSettings service — no database change.

const store = require('../services/integrationSettings');

// Verify a Google Maps key server-side using the Geocoding web service. Returns a
// customer-friendly { ok, message } — never leaks raw Google error internals.
async function verifyGoogleKey(key) {
  if (!key) return { ok: false, message: 'No API key is configured.' };
  let json;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=India&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url, { method: 'GET' });
    json = await resp.json();
  } catch (e) {
    return { ok: false, message: 'Could not reach Google. Please check the server’s internet connection and try again.' };
  }
  switch (json && json.status) {
    case 'OK':
    case 'ZERO_RESULTS':
      return { ok: true, message: 'Google Maps connected successfully.' };
    case 'REQUEST_DENIED':
      return { ok: false, message: 'The API key was rejected by Google. Verify the key and that Maps JavaScript, Places and Geocoding APIs are enabled for it.' };
    case 'OVER_QUERY_LIMIT':
      return { ok: false, message: 'Google Maps quota exceeded or billing is not enabled for this key.' };
    case 'INVALID_REQUEST':
      return { ok: false, message: 'The API key could not be verified. Please try again.' };
    default:
      return { ok: false, message: 'Could not verify the API key. Please try again later.' };
  }
}

// Admin-facing view of the current config (never returns the raw key).
function adminView() {
  const gm = store.getGoogleMaps();
  return {
    configured: !!gm.apiKey,
    source: gm.source,                    // 'settings' | 'env' | 'none'
    status: gm.status,                    // 'connected' | 'failed' | 'unverified' | 'not_configured'
    lastVerified: gm.lastVerified,
    keyPreview: store.maskKey(gm.apiKey),
  };
}

// ── PUBLIC (any authenticated user): the key needed to load the Maps JS API ──
// Returning the key to the browser is inherent to Google Maps JS; it is secured
// by HTTP-referrer restriction on the key. Never surfaced in any UI as text.
exports.getPublicMapsConfig = (req, res) => {
  const gm = store.getGoogleMaps();
  res.json({ configured: !!gm.apiKey, apiKey: gm.apiKey || null });
};

// ── Super Admin: read current Google Maps integration status ─────────────────
exports.getGoogleMaps = (req, res) => {
  res.json(adminView());
};

// ── Super Admin: save the Google Maps API key ────────────────────────────────
exports.updateGoogleMaps = (req, res) => {
  const apiKey = String(req.body?.apiKey ?? '').trim();
  // Saving a new/changed key resets verification; an empty value clears it.
  store.setGoogleMaps({ apiKey, status: apiKey ? 'unverified' : 'not_configured', lastVerified: apiKey ? undefined : null });
  res.json({ ...adminView(), message: apiKey ? 'Google Maps API key saved.' : 'Google Maps configuration cleared.' });
};

// ── Any authenticated user: resolve an address from a pasted Google Maps URL ─
// Fallback path used by the picker when the Maps JS API can't load in the browser.
// Extracts coordinates from the URL (expanding short links if needed) and reverse
// geocodes them server-side with the stored key, so the user can still complete
// the address without the interactive map.
function coordsFromUrl(url) {
  const v = String(url || '').replace(/%2C/gi, ',');
  const patterns = [
    /[?&]query=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // embedded place coords
  ];
  for (const re of patterns) {
    const m = v.match(re);
    if (m) { const lat = parseFloat(m[1]); const lng = parseFloat(m[2]); if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }; }
  }
  return null;
}

async function expandShortLink(url) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 HRMate' } });
    return r.url || url;
  } catch (_) {
    return url;
  }
}

exports.geocodeLocation = async (req, res) => {
  const key = store.getGoogleMaps().apiKey;
  if (!key) {
    return res.status(400).json({ message: 'Location lookup is currently unavailable. Please contact your system administrator.' });
  }
  const body = req.body || {};
  let coords = null;
  if (body.lat != null && body.lng != null && !isNaN(Number(body.lat)) && !isNaN(Number(body.lng))) {
    coords = { lat: Number(body.lat), lng: Number(body.lng) };
  } else if (body.url) {
    coords = coordsFromUrl(body.url);
    if (!coords) coords = coordsFromUrl(await expandShortLink(body.url));
  }
  if (!coords) {
    return res.status(422).json({ message: 'Could not read a location from that link. Paste a full Google Maps URL that contains coordinates.' });
  }

  let json;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url, { method: 'GET' });
    json = await resp.json();
  } catch (_) {
    return res.status(502).json({ message: 'Could not reach Google to resolve the address. Please try again.' });
  }
  if (json && json.status === 'OK' && Array.isArray(json.results) && json.results[0]) {
    const r = json.results[0];
    return res.json({
      lat: coords.lat, lng: coords.lng,
      placeId: r.place_id || '',
      formattedAddress: r.formatted_address || '',
      components: r.address_components || [],
    });
  }
  if (json && json.status === 'REQUEST_DENIED') {
    return res.status(400).json({ message: 'Location lookup is currently unavailable. Please contact your system administrator.' });
  }
  return res.status(422).json({ message: 'No address was found for that location. Please try another Google Maps link.' });
};

// ── Super Admin: test the connection ─────────────────────────────────────────
// Tests the key in the request body if provided (pre-save check), otherwise the
// saved key. When testing the saved key, the verified status is persisted.
exports.testGoogleMaps = async (req, res) => {
  const provided = String(req.body?.apiKey ?? '').trim();
  const saved = store.getGoogleMaps();
  const keyToTest = provided || saved.apiKey;
  if (!keyToTest) {
    return res.status(400).json({ ok: false, message: 'Enter and save a Google Maps API key first.' });
  }
  const result = await verifyGoogleKey(keyToTest);
  // Persist status only when we tested the effective saved key.
  if (!provided || provided === saved.apiKey) {
    const now = new Date().toISOString();
    store.setGoogleMaps({ status: result.ok ? 'connected' : 'failed', lastVerified: result.ok ? now : saved.lastVerified });
  }
  res.json({ ...result, ...adminView() });
};
