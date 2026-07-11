// ─────────────────────────────────────────────────────────────────────────────
// Invoice canvas geometry — the ONE place that decides where an element may sit.
//
// The exported PDF renders into `.canvas-container { width:794px; height:1123px;
// overflow:hidden }` (see renderCanvasHtml in invoiceTemplate.ts), with every
// element absolutely positioned at its raw x/y/w/h. So the PAGE is the boundary
// that actually clips output — anything crossing it is silently cut from the PDF.
// That is the hard invariant enforced here:
//
//     0 <= x,  0 <= y,  x + w <= A4_W,  y + h <= A4_H
//
// The 20px margin is a SAFE AREA, not the clipping edge. An element that fits
// inside the safe area is kept there (so ordinary text and logos never stray into
// the margin), while a deliberately full-bleed element — the Banner template ships
// a header rect at x:0, w:794 — is allowed to reach the page edge instead of being
// crushed to the margin. Both rules fall out of `axisBounds` below.
//
// Every mutation path (drag, resize, arrow keys, X/Y inputs, add, duplicate,
// template import, save validation) funnels through `clampRect`, so there is no
// route by which an element can leave the page.
// ─────────────────────────────────────────────────────────────────────────────

export const A4_W = 794;
export const A4_H = 1123;
/** Safe area inset. Snapping + default placement honour it; it does not clip. */
export const MARGIN = 20;
export const GRID_SIZE = 10;
export const MIN_SIZE = 20;

export const PRINTABLE_W = A4_W - MARGIN * 2;
export const PRINTABLE_H = A4_H - MARGIN * 2;

export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const snapTo = (v: number, step = GRID_SIZE) => Math.round(v / step) * step;
const px = (v: number) => Math.round(Number.isFinite(v) ? v : 0);

/**
 * Does this rect already extend beyond the safe area on the given axis?
 *
 * This is the "full-bleed" test. The Banner template ships a header rect at
 * (x:0, y:0, w:794, h:120) with the logo and title sitting on top of it — a
 * deliberate edge-to-edge design. Confining it to the safe area would shove it to
 * (20, 20, 754) and wreck the template on load. So an element that was AUTHORED
 * to bleed keeps the freedom to bleed; one that lives inside the safe area is
 * held there.
 */
export const bleedsX = (r: Rect) => r.x < MARGIN || r.x + r.w > A4_W - MARGIN;
export const bleedsY = (r: Rect) => r.y < MARGIN || r.y + r.h > A4_H - MARGIN;

/** Which axes this element is allowed to take all the way to the page edge. */
export function freeAxes(ref: Rect): { freeX: boolean; freeY: boolean } {
  return {
    freeX: ref.w > PRINTABLE_W || bleedsX(ref),
    freeY: ref.h > PRINTABLE_H || bleedsY(ref),
  };
}

/** Lowest / highest coordinate an EDGE may take. `free` → the page; else the safe area. */
export const minEdge = (free: boolean) => (free ? 0 : MARGIN);
export const maxEdge = (free: boolean, pageSize: number) => (free ? pageSize : pageSize - MARGIN);

/**
 * Force a rect fully inside the page. `ref` is the element's geometry BEFORE the
 * change (defaults to the rect itself), and decides whether it may bleed.
 *
 * The page bound is absolute and always applied — that is the invariant that keeps
 * the exported PDF from clipping. The safe-area bound is applied on top of it only
 * for elements that were already living inside the safe area.
 */
export function clampRect(r: Rect, ref: Rect = r, minSize: number = MIN_SIZE): Rect {
  const w = clamp(px(r.w), minSize, A4_W);
  const h = clamp(px(r.h), minSize, A4_H);
  const { freeX, freeY } = freeAxes({ ...ref, w, h });
  const loX = minEdge(freeX), hiX = maxEdge(freeX, A4_W) - w;
  const loY = minEdge(freeY), hiY = maxEdge(freeY, A4_H) - h;
  return {
    // hi can fall below lo only if the caller shrank the safe area under the
    // element; Math.min-then-max keeps the result on the page either way.
    x: clamp(px(r.x), Math.min(loX, hiX), Math.max(loX, hiX)),
    y: clamp(px(r.y), Math.min(loY, hiY), Math.max(loY, hiY)),
    w, h,
  };
}

/** True when any part of the element would be clipped out of the exported PDF. */
export function isOutsidePage(el: Rect): boolean {
  return el.x < 0 || el.y < 0 || el.x + el.w > A4_W || el.y + el.h > A4_H;
}

export function elementsOutsidePage<T extends Rect>(els: T[]): T[] {
  return (els || []).filter(isOutsidePage);
}

/**
 * Auto-correction for imported / seeded templates: pull every element back inside
 * the page. It ONLY clamps. It deliberately does not shuffle elements apart —
 * overlap is a legitimate design (text over a banner, a stamp over a signature),
 * and rearranging a designer's template on load is not a fix, it is damage.
 */
/**
 * Smallest legal extent for an element. A Divider Line is authored 10px tall and
 * renders as a 0-height border, so forcing it to the 20px generic minimum would
 * silently rewrite every template that ships one.
 */
export const minSizeFor = (type?: string): number => (type === 'line' ? 1 : MIN_SIZE);

export function autoFixLayout<T extends Rect & { type?: string }>(elements: T[]): T[] {
  return (elements || []).map(el => Object.assign({}, el, clampRect(el, el, minSizeFor(el.type))));
}
