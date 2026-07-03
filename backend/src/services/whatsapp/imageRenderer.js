// ─────────────────────────────────────────────────────────────────────────────
// imageRenderer — turns the cardRenderer HTML into a high-quality PNG using a
// headless Chromium (puppeteer). The browser is launched once and reused across
// renders (cold start ~1-2s, warm renders are fast). A small content-addressed
// cache returns the identical PNG for identical HTML so we never re-render — and,
// combined with the upload-layer media cache, never re-upload — the same image.
//
// Render-only: this module never talks to Meta, the DB, or the queue.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const cardRenderer = require('./cardRenderer');

let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch (_) { puppeteer = null; }

let browserPromise = null;

// One shared browser instance. If it dies (crash / disconnect) we drop the
// reference so the next render relaunches it.
const getBrowser = async () => {
  if (!puppeteer) throw new Error('puppeteer is not installed — run `npm install puppeteer` in backend.');
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    }).then((b) => {
      b.on('disconnected', () => { browserPromise = null; });
      return b;
    }).catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
};

// Tiny LRU of recently rendered PNGs, keyed by a hash of the HTML.
const CACHE_MAX = Number(process.env.WHATSAPP_IMAGE_CACHE || 50);
const cache = new Map(); // key -> Buffer
const cacheGet = (k) => {
  if (!cache.has(k)) return null;
  const v = cache.get(k);
  cache.delete(k); cache.set(k, v); // bump recency
  return v;
};
const cacheSet = (k, v) => {
  cache.set(k, v);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
};

const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Render an arbitrary HTML document to a PNG Buffer (screenshots the .card node
// at its natural size; falls back to a fixed-viewport full-page shot).
const renderHtmlToPng = async (html) => {
  const key = hashOf(html);
  const cached = cacheGet(key);
  if (cached) return { png: cached, hash: key, cached: true };

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: cardRenderer.CARD_W, height: cardRenderer.CARD_H, deviceScaleFactor: 1 });
    // waitUntil networkidle0 ensures base64/remote images (logo, photo) are painted.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const el = await page.$('.card');
    const png = el
      ? await el.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: cardRenderer.CARD_W, height: cardRenderer.CARD_H } });
    const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
    cacheSet(key, buf);
    return { png: buf, hash: key, cached: false };
  } finally {
    await page.close().catch(() => {});
  }
};

// High-level: render a personalized greeting card PNG from a template + employee.
const renderCardPng = async ({ template, employee, company, branch } = {}) => {
  const html = cardRenderer.buildCardHtml({ template, employee, company, branch });
  return renderHtmlToPng(html);
};

const isAvailable = () => !!puppeteer;

const shutdown = async () => {
  if (browserPromise) {
    try { const b = await browserPromise; await b.close(); } catch (_) {}
    browserPromise = null;
  }
};

module.exports = { renderCardPng, renderHtmlToPng, isAvailable, shutdown, hashOf };
