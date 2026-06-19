/**
 * IFSC lookup — resolves an IFSC code to its bank + branch details.
 *
 * Uses the free, public Razorpay IFSC API (https://ifsc.razorpay.com/<IFSC>),
 * proxied server-side so the browser never hits CORS and results can be cached.
 * One IFSC = one bank + one branch (the source of truth for bank fields).
 */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const cache = new Map(); // code -> normalized result (process-lifetime cache)

exports.lookup = async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  if (!IFSC_RE.test(code)) {
    return res.status(400).json({ valid: false, error: 'Invalid IFSC format. Expected e.g. SBIN0001234.' });
  }
  if (cache.has(code)) return res.json(cache.get(code));

  try {
    const resp = await fetch(`https://ifsc.razorpay.com/${code}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (resp.status === 404) {
      return res.status(404).json({ valid: false, error: 'Invalid IFSC Code. Bank details not found.' });
    }
    if (!resp.ok) {
      return res.status(502).json({ valid: false, error: 'IFSC service returned an error. Please enter bank details manually.' });
    }
    const d = await resp.json();
    const out = {
      valid: true,
      ifsc: d.IFSC || code,
      bankName: d.BANK || '',
      bankBranch: d.BRANCH || '',
      bankAddress: d.ADDRESS || '',
      bankCity: d.CITY || '',
      bankDistrict: d.DISTRICT || d.CITY || '',
      bankState: d.STATE || '',
    };
    cache.set(code, out);
    return res.json(out);
  } catch (e) {
    console.error('ifsc.lookup', e.message);
    return res.status(502).json({ valid: false, error: 'IFSC lookup service is unavailable. Please enter bank details manually.' });
  }
};
