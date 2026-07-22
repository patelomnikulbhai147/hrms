// ─────────────────────────────────────────────────────────────────────────────
// ONE RENDERER DECISION for every surface that shows an invoice.
//
// Template Gallery preview · Create-Invoice preview · print window · PDF all call
// renderInvoiceHtml, so "what the gallery showed" is byte-identical to what
// prints. This used to live privately inside InvoiceManagement.tsx, which meant
// the gallery had to re-implement the choice and could drift out of step.
//
// Selection rules (unchanged):
//   • a saved layout whose blocks are the ELEMENT model → invoiceDocHtml(isCanvas)
//   • a saved layout in the LEGACY block model          → canvasDocHtml
//   • no layout                                          → the built-in default,
//     serviceInvoiceHtml (the same definition the WYSIWYG editor renders)
//
// GST, totals and numbering are never touched here — this only picks a skin.
// ─────────────────────────────────────────────────────────────────────────────
import { invoiceDocHtml, canvasDesignFromLayout, layoutIsElementModel, type InvoiceDesign } from './invoiceTemplate';
import { canvasDocHtml, type InvoiceLayout } from './invoiceCanvas';
import { serviceInvoiceHtml } from './serviceInvoice';

/**
 * The BUILT-IN template (the `layout === null` case) — the A4 tax invoice
 * Create Invoice renders. It is a first-class Template Gallery entry, and
 * Create Invoice names it in its "Template" strip, so both read these from here
 * rather than each hardcoding a string that could drift.
 */
export const SYSTEM_TEMPLATE_NAME = 'Default Template';
export const SYSTEM_TEMPLATE_CATEGORY = 'Professional Tax Invoice';

export interface RenderInvoiceOpts { print?: boolean; qrDataUrl?: string }

export function renderInvoiceHtml(
  inv: any,
  company: any,
  design: InvoiceDesign | undefined,
  layout: InvoiceLayout | null | undefined,
  opts: RenderInvoiceOpts = {},
  settings?: any,
): string {
  if (layout) {
    return layoutIsElementModel(layout)
      ? invoiceDocHtml(inv, company, canvasDesignFromLayout(layout), opts)
      : canvasDocHtml(inv, company, layout, opts);
  }
  // The Dispatch & Destination switch lives with the other template settings, so
  // print / PDF / email honour it exactly as the on-screen document does.
  return serviceInvoiceHtml(inv, company, settings, { ...opts, showLogistics: settings?.showLogistics !== false });
}

/**
 * Open a rendered document in a new window for VIEWING only. Returns false when
 * a popup blocker stopped it, so the caller can say so.
 *
 * Never pass `{ print: true }` HTML here — see printInvoiceDocument for why.
 */
export function openInvoiceWindow(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;                       // popup blocked — caller reports it
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}

/**
 * PRINT / PDF — renders the document in a hidden same-page iframe and prints it.
 *
 * WHY NOT A POPUP (this was the freeze):
 * printing used to `window.open('', '_blank', …)` a same-origin popup whose HTML
 * carried an onload `window.print()`. A same-origin popup opened via window.open
 * stays in the OPENER'S RENDERER PROCESS, and window.print() spins a nested
 * modal message loop on that process — so the dialog blocked the app tab too:
 * no clicks, no scroll, no keyboard. Dismissing the dialog normally unwinds it,
 * but if the popup was closed (or blocked, or navigated) while its dialog was up,
 * the nested loop was orphaned and the app stayed wedged until a refresh. That
 * matches the report exactly, and it is why the freeze was intermittent.
 *
 * An iframe has no separate window to orphan: the document is part of this page,
 * printing is driven from here, and the frame is ALWAYS removed afterwards —
 * via onafterprint, via the window regaining focus when the dialog closes, and
 * via a final teardown sweep. Those are resource cleanup, not a way to paper
 * over a hang: the print itself is driven synchronously off the frame's load.
 *
 * Pass HTML rendered with `{ print: true }`: the document carries its own
 * auto-print script, and the canvas renderer's version waits for
 * `document.fonts.ready` first so a web font can never be substituted in the
 * PDF. We host and tear down; the document decides WHEN to print. (Calling
 * win.print() from here as well would open the dialog twice and lose that font
 * guarantee.)
 *
 * Returns a promise that settles once the document has been handed to the
 * browser, so callers can keep their loading state honest.
 */
export function printInvoiceDocument(html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = 'Invoice print';
    // Zero-size and hidden: it can never cover the UI or intercept a click.
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

    let torn = false;
    const teardown = () => {
      if (torn) return;
      torn = true;
      window.removeEventListener('focus', onWindowFocus);
      window.clearTimeout(sweep);
      try { frame.remove(); } catch { /* already gone */ }
    };
    // The tab regains focus the moment the print dialog closes (either button).
    const onWindowFocus = () => window.setTimeout(teardown, 400);
    // Last-resort teardown so a stray iframe can never accumulate.
    const sweep = window.setTimeout(teardown, 60_000);

    const finish = () => { resolve(); };

    try {
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) { teardown(); finish(); return; }

      // Arm teardown as soon as the frame is live. The document's own script
      // fires the dialog (after fonts settle); we only make sure the frame is
      // always removed once that dialog is done with, however it ends.
      frame.onload = () => {
        try {
          win.onafterprint = teardown;
          window.addEventListener('focus', onWindowFocus);
          win.focus();
        } catch (e) {
          console.error('[invoice] print setup failed', e);
          teardown();
        } finally {
          finish();
        }
      };

      doc.open();
      doc.write(html);
      doc.close();          // fires the frame's load event
    } catch (e) {
      console.error('[invoice] could not prepare the print document', e);
      teardown();
      finish();
    }
  });
}

/** Download any text payload as a file (template export). */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filesystem-safe slug for exported template filenames. */
export const slugify = (s: string) =>
  String(s || 'template').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
