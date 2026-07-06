// ─────────────────────────────────────────────────────────────────────────────
// Template-based card export: renders CardCanvas offscreen (scale 1, no CSS
// transform) and captures with html2canvas-pro, then assembles PDF / PNG / ZIP.
// Card-size PDF pages use the EXACT millimetre footprint so output is PVC-printer
// ready; A4 sheet layout tiles many cards per page; duplex ordering emits all
// fronts then all backs for double-sided printing.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CardCanvas } from '@/components/cards/CardCanvas';
import type { CardTemplate, CardSide } from '@/types/cardDesigner';
import { cardDimensions } from '@/types/cardDesigner';
import { qrDataUrl, verificationUrl } from '@/utils/cardCodes';

export interface CardItem { employee: any; branding: any; companyId?: number | string; }
export type SideMode = 'front' | 'back' | 'both';
export type PdfLayout = 'card' | 'sheet' | 'duplex';

async function capture(node: HTMLElement, scale = 3) {
  const { default: html2canvas } = await import('html2canvas-pro');
  return html2canvas(node, { scale, useCORS: true, backgroundColor: null, logging: false });
}

// Mount one card side offscreen and capture it → { dataUrl, wmm, hmm }.
async function captureSide(template: CardTemplate, side: CardSide, item: CardItem, scale: number) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;background:transparent';
  document.body.appendChild(host);
  const root = createRoot(host);
  const dims = cardDimensions(template.size, template.orientation);
  let captureNode: HTMLElement | null = null;
  await new Promise<void>((resolve) => {
    root.render(
      React.createElement(CardCanvas, {
        template, side, employee: item.employee, branding: item.branding, companyId: item.companyId,
        scale: 1, innerRef: (n: HTMLDivElement | null) => { captureNode = n; },
      })
    );
    setTimeout(resolve, 260); // let React paint + images decode (data-URLs are instant)
  });
  try {
    const node = (captureNode || host.firstElementChild) as HTMLElement;
    const canvas = await capture(node, scale);
    return { dataUrl: canvas.toDataURL('image/png'), wmm: dims.wmm, hmm: dims.hmm };
  } finally {
    try { root.unmount(); } catch { /* noop */ }
    host.remove();
  }
}

function sidesFor(mode: SideMode): CardSide[] { return mode === 'both' ? ['front', 'back'] : [mode]; }

export interface ExportOpts { sideMode?: SideMode; layout?: PdfLayout; fileName?: string; scale?: number; onProgress?: (done: number, total: number) => void; }

// ── PDF ───────────────────────────────────────────────────────────────────────
export async function exportCardsPdf(template: CardTemplate, items: CardItem[], opts: ExportOpts = {}) {
  const { sideMode = 'both', layout = 'card', fileName = 'employee-cards.pdf', scale = 3, onProgress } = opts;
  const { default: jsPDF } = await import('jspdf');
  const sides = sidesFor(sideMode);
  const dims = cardDimensions(template.size, template.orientation);
  const total = items.length * sides.length;
  let done = 0;

  if (layout === 'sheet') {
    // A4 grid — fronts on their own sheet(s), then backs (if requested).
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 10, gap = 4;
    const cols = Math.max(1, Math.floor((pageW - 2 * margin + gap) / (dims.wmm + gap)));
    const rows = Math.max(1, Math.floor((pageH - 2 * margin + gap) / (dims.hmm + gap)));
    const perPage = cols * rows;
    let first = true;
    for (const side of sides) {
      const shots: string[] = [];
      for (const it of items) { shots.push((await captureSide(template, side, it, scale)).dataUrl); done++; onProgress?.(done, total); }
      for (let i = 0; i < shots.length; i++) {
        const slot = i % perPage;
        if (slot === 0) { if (!first) pdf.addPage(); first = false; }
        const c = slot % cols, r = Math.floor(slot / cols);
        const x = margin + c * (dims.wmm + gap), y = margin + r * (dims.hmm + gap);
        pdf.addImage(shots[i], 'PNG', x, y, dims.wmm, dims.hmm);
      }
    }
    pdf.save(fileName);
    return;
  }

  // card / duplex — one card per page at exact mm size.
  const orient = dims.wmm >= dims.hmm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: [dims.wmm, dims.hmm] });
  let firstPage = true;
  const addPage = (dataUrl: string) => {
    if (!firstPage) pdf.addPage([dims.wmm, dims.hmm], orient); firstPage = false;
    pdf.addImage(dataUrl, 'PNG', 0, 0, dims.wmm, dims.hmm);
  };
  if (layout === 'duplex' && sideMode === 'both') {
    const fronts: string[] = [], backs: string[] = [];
    for (const it of items) { fronts.push((await captureSide(template, 'front', it, scale)).dataUrl); done++; onProgress?.(done, total); }
    for (const it of items) { backs.push((await captureSide(template, 'back', it, scale)).dataUrl); done++; onProgress?.(done, total); }
    fronts.forEach(addPage); backs.forEach(addPage);
  } else {
    for (const it of items) {
      for (const side of sides) { addPage((await captureSide(template, side, it, scale)).dataUrl); done++; onProgress?.(done, total); }
    }
  }
  pdf.save(fileName);
}

// ── PNG (single card, chosen side) ────────────────────────────────────────────
export async function exportCardPng(template: CardTemplate, item: CardItem, side: CardSide, fileName: string, scale = 3) {
  const { dataUrl } = await captureSide(template, side, item, scale);
  const a = document.createElement('a'); a.href = dataUrl; a.download = fileName; a.click();
}

// ── ZIP of PNGs (one file per employee/side) ──────────────────────────────────
export async function exportCardsZip(template: CardTemplate, items: CardItem[], opts: ExportOpts = {}) {
  const { sideMode = 'both', fileName = 'employee-cards.zip', scale = 3, onProgress } = opts;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const sides = sidesFor(sideMode);
  const total = items.length * sides.length; let done = 0;
  for (const it of items) {
    const base = (it.employee?.employeeId || it.employee?.name || 'employee').toString().replace(/[^\w.-]+/g, '_');
    for (const side of sides) {
      const { dataUrl } = await captureSide(template, side, it, scale);
      zip.file(`${base}-${side}.png`, dataUrl.split(',')[1], { base64: true });
      done++; onProgress?.(done, total);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
}

// ── ZIP of employee QR codes (verification URLs) ──────────────────────────────
export async function exportQrZip(items: CardItem[], fileName = 'employee-qr-codes.zip', onProgress?: (d: number, t: number) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const url = qrDataUrl(verificationUrl(it.employee, it.companyId), 480, '#0f172a', '#ffffff');
    const base = (it.employee?.employeeId || it.employee?.name || 'employee').toString().replace(/[^\w.-]+/g, '_');
    if (url) zip.file(`${base}-qr.png`, url.split(',')[1], { base64: true });
    onProgress?.(i + 1, items.length);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
}

// ── Print (opens a print window with captured card images) ────────────────────
export async function printCards(template: CardTemplate, items: CardItem[], opts: ExportOpts = {}) {
  const { sideMode = 'both', layout = 'card', scale = 3, onProgress } = opts;
  const sides = sidesFor(sideMode);
  const dims = cardDimensions(template.size, template.orientation);
  const total = items.length * sides.length; let done = 0;
  const shots: { url: string; side: CardSide }[] = [];
  if (layout === 'duplex' && sideMode === 'both') {
    for (const it of items) { shots.push({ url: (await captureSide(template, 'front', it, scale)).dataUrl, side: 'front' }); done++; onProgress?.(done, total); }
    for (const it of items) { shots.push({ url: (await captureSide(template, 'back', it, scale)).dataUrl, side: 'back' }); done++; onProgress?.(done, total); }
  } else {
    for (const it of items) for (const side of sides) { shots.push({ url: (await captureSide(template, side, it, scale)).dataUrl, side }); done++; onProgress?.(done, total); }
  }
  const w = window.open('', '_blank'); if (!w) return;
  const sheet = layout === 'sheet';
  const imgCss = `width:${dims.wmm}mm;height:${dims.hmm}mm;object-fit:contain;`;
  const wrapCss = sheet
    ? 'display:flex;flex-wrap:wrap;gap:4mm;align-content:flex-start;'
    : '';
  const body = shots.map((s) => sheet
    ? `<img src="${s.url}" style="${imgCss}"/>`
    : `<div style="page-break-after:always;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${s.url}" style="${imgCss}"/></div>`
  ).join('');
  w.document.write(`<html><head><title>Employee Cards</title><style>@page{margin:${sheet ? '8mm' : '0'}}body{margin:0}</style></head><body><div style="${wrapCss}">${body}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
}
