// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION INVOICE — dedicated full-page viewer (/subscription-invoice/:id).
//
// Invoice-first design: the A4 document is the primary focus and fills the
// content area (Fit Width by default), with ONE sticky toolbar at the top and a
// summary panel that is COLLAPSED by default (expands to the right on desktop,
// stacks below on tablet/mobile). No modal, no duplicate bottom toolbar.
//
// SCOPE: presentation only. Invoice data, calculations, billing/payment logic,
// PDF generation, DB and API are all untouched — Print/Download still use the
// same server-rendered HTML, so the printed output is byte-identical and never
// includes the toolbar or summary panel.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer, Download, Mail, CheckCircle2, Ban, Copy, RefreshCw, RotateCcw,
  Plus, Wallet, ArrowLeft, Receipt, PanelRightOpen, PanelRightClose, MoreHorizontal, X, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';
import { INVOICE_STATUS_VARIANT } from '@/components/subscription/billing/calc';

const PAY_METHODS = ['Bank Transfer', 'UPI', 'Card', 'Cash', 'Cheque', 'Other'];
const A4_W = 794;    // 210mm @96dpi
const A4_H = 1123;   // 297mm @96dpi
type ZoomMode = number | 'fitWidth' | 'fitPage';

interface Props {
  invoiceId: number | string;
  onBack: () => void;
}

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export const SubscriptionInvoicePage: React.FC<Props> = ({ invoiceId, onBack }) => {
  const [inv, setInv] = useState<any>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ amount: 0, method: 'Bank Transfer', referenceNo: '', notes: '' });
  // Summary panel is COLLAPSED by default so the invoice owns the full width.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('fitWidth');
  const [colW, setColW] = useState(0);
  const [docH, setDocH] = useState(A4_H);
  const colRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, h] = await Promise.all([
        api.subscriptionInvoices.get(invoiceId),
        api.subscriptionInvoices.fetchHtml(invoiceId).catch(() => ''),
      ]);
      setInv(d); setHtml(h);
      setPay((p) => ({ ...p, amount: Math.max(0, (d.grandTotal || 0) - (d.amountPaid || 0)) }));
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  // Track the invoice column width so Fit Width / Fit Page stay accurate as the
  // summary panel opens/closes and on window resize.
  useEffect(() => {
    const measure = () => setColW(colRef.current?.clientWidth || 0);
    measure();
    const t = setTimeout(measure, 250); // after the panel transition
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [loading, summaryOpen]);

  // Measure the rendered invoice's real height from inside the frame so the
  // wrapper reserves exactly the right space and the page scrolls naturally.
  const onFrameLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const d = e.currentTarget.contentDocument;
      if (d) setDocH(Math.max(A4_H, d.documentElement.scrollHeight || A4_H));
    } catch { /* cross-origin: keep the A4 default */ }
  }, []);

  const scale = useMemo(() => {
    const avail = Math.max(320, colW - 8);
    if (zoom === 'fitWidth') return Math.min(1.75, Math.max(0.35, avail / A4_W));
    if (zoom === 'fitPage') return Math.min(1.75, Math.max(0.3, Math.min(avail / A4_W, (window.innerHeight - 150) / A4_H)));
    return zoom;
  }, [zoom, colW]);
  const viewScale = scale;

  const act = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    try { await fn(); ui.toast.success(okMsg); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  // Print / Download use the SAME server HTML — the toolbar and summary panel are
  // never part of the printed document.
  const printDoc = async () => {
    try {
      const h = html || await api.subscriptionInvoices.fetchHtml(invoiceId);
      const w = window.open('', '_blank', 'width=900,height=1100');
      if (!w) { ui.toast.error('Allow pop-ups to print/download the invoice.'); return; }
      w.document.write(h); w.document.close(); w.focus();
      setTimeout(() => w.print(), 350);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const markPaid = async () => { if (await ui.confirm({ title: 'Mark invoice as paid?', message: 'This settles the full balance and records a payment.', confirmText: 'Mark Paid', variant: 'primary' })) act(() => api.subscriptionInvoices.setStatus(invoiceId, { status: 'Paid' }), 'Invoice marked paid.'); };
  const cancel = async () => { if (await ui.confirm({ title: 'Cancel invoice?', message: 'The invoice will be voided.', confirmText: 'Cancel Invoice', variant: 'danger' })) act(() => api.subscriptionInvoices.setStatus(invoiceId, { status: 'Cancelled' }), 'Invoice cancelled.'); };
  const email = () => act(() => api.subscriptionInvoices.email(invoiceId, {}).then((r: any) => { if (r?.devMode) ui.toast.info(r.message || 'Email logged (SMTP not configured).'); }), 'Invoice emailed.');
  const duplicate = () => act(() => api.subscriptionInvoices.duplicate(invoiceId), 'Duplicated as a new draft.');
  const regenerate = () => act(() => api.subscriptionInvoices.regenerate(invoiceId), 'Recomputed from live company data.');
  const renew = () => act(() => api.subscriptionInvoices.renew(invoiceId), 'Renewal invoice generated.');

  const recordPayment = async () => {
    if (!(pay.amount > 0)) { ui.toast.error('Enter a payment amount.'); return; }
    await act(() => api.subscriptionInvoices.addPayment(invoiceId, pay), 'Payment recorded.');
    setShowPay(false);
  };

  const balance = inv ? Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0)) : 0;
  const settled = !!inv && ['Paid', 'Cancelled', 'Refunded'].includes(inv.status);

  const openPayment = () => { setSummaryOpen(true); setShowPay(true); };

  if (loading || !inv) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-secondary hover:text-ink mb-6"><ArrowLeft size={15} /> Back to Billing</button>
        <div className="py-24 text-center text-ink-muted text-sm">Loading invoice…</div>
      </div>
    );
  }

  const zoomBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick}
      className={`h-7 px-2 rounded-md text-[11.5px] font-semibold transition-colors ${active ? 'bg-brand-600 text-white' : 'text-ink-secondary hover:bg-surface-muted'}`}>
      {label}
    </button>
  );

  // The summary panels — rendered in the right rail (desktop) or below (mobile).
  const summaryPanels = (
    <>
      <Panel title="Invoice Summary">
        <Row label="Status" value={<Badge variant={INVOICE_STATUS_VARIANT[inv.status] || 'gray'} dot>{inv.status}</Badge>} />
        <Row label="Company" value={inv.companyName} />
        <Row label="Plan" value={inv.plan} />
        <Row label="Billing Cycle" value={inv.billingCycle} />
        <Row label="Employees" value={inv.employeeCount} />
        <Row label="Price / Employee" value={inr(inv.pricePerEmployee)} />
        <Row label="Invoice Date" value={fmtDate(inv.invoiceDate)} />
        <Row label="Due Date" value={fmtDate(inv.dueDate)} />
        {inv.renewalDate && <Row label="Renewal Date" value={fmtDate(inv.renewalDate)} />}
      </Panel>

      <Panel title="Payment & GST Summary">
        <Row label="Subtotal" value={inr(inv.subtotal)} />
        {!!inv.discountAmount && <Row label={`Discount (${inv.discountPercent}%)`} value={`− ${inr(inv.discountAmount)}`} />}
        <Row label="Taxable Value" value={inr((inv.subtotal || 0) - (inv.discountAmount || 0))} />
        {inv.interState ? (
          <Row label={`IGST (${inv.gstPercent}%)`} value={inr(inv.igst)} />
        ) : (
          <>
            <Row label={`CGST (${(inv.gstPercent || 0) / 2}%)`} value={inr(inv.cgst)} />
            <Row label={`SGST (${(inv.gstPercent || 0) / 2}%)`} value={inr(inv.sgst)} />
          </>
        )}
        <div className="h-px bg-hairline my-1.5" />
        <Row label="Grand Total" value={inr(inv.grandTotal)} bold />
        <Row label="Paid Amount" value={inr(inv.amountPaid)} />
        <Row label="Outstanding" value={inr(balance)} bold danger={balance > 0} />
      </Panel>

      {!settled && (
        <Panel title="Quick Actions">
          <Button size="sm" variant="outline" className="w-full" icon={<Plus size={14} />} onClick={() => setShowPay((v) => !v)}>
            {showPay ? 'Hide Payment Form' : 'Record Payment'}
          </Button>
          {showPay && (
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-bold text-brand-700 uppercase tracking-wide flex items-center gap-1.5"><Wallet size={13} /> New Payment</div>
              <input type="number" placeholder="Amount" value={pay.amount || ''} onChange={(e) => setPay((p) => ({ ...p, amount: Number(e.target.value) }))} className="w-full h-9 px-3 rounded-lg border border-hairline bg-surface text-sm" />
              <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-hairline bg-surface text-sm">
                {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input placeholder="Reference No." value={pay.referenceNo} onChange={(e) => setPay((p) => ({ ...p, referenceNo: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-hairline bg-surface text-sm" />
              <input placeholder="Notes" value={pay.notes} onChange={(e) => setPay((p) => ({ ...p, notes: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-hairline bg-surface text-sm" />
              <Button size="sm" className="w-full" onClick={recordPayment} loading={busy}>Save Payment</Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <Button size="xs" variant="outline" icon={<Copy size={13} />} onClick={duplicate}>Duplicate</Button>
            <Button size="xs" variant="outline" icon={<RefreshCw size={13} />} onClick={regenerate}>Regenerate</Button>
            <Button size="xs" variant="outline" icon={<RotateCcw size={13} />} onClick={renew}>Renew</Button>
            <Button size="xs" variant="outline" icon={<Ban size={13} />} onClick={cancel}>Cancel</Button>
          </div>
        </Panel>
      )}

      <div className="rounded-2xl border border-hairline bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-hairline text-[12px] font-bold text-ink uppercase tracking-wide">Payment History</div>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Ref</Th></Tr></Thead>
            <Tbody>
              {(inv.payments || []).length === 0 ? (
                <Tr><Td colSpan={4}><div className="py-6 text-center text-ink-muted text-[13px]">No payments yet.</div></Td></Tr>
              ) : inv.payments.map((p: any) => (
                <Tr key={p.id}>
                  <Td className="text-[12px]">{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</Td>
                  <Td className="tabular-nums font-semibold text-[12px]">{inr(p.amount)}</Td>
                  <Td className="text-[12px]">{p.method || '—'}</Td>
                  <Td className="text-[12px] text-ink-muted">{p.referenceNo || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-full bg-slate-100/70">
      {/* ══ THE single sticky toolbar ══ */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-hairline">
        <div className="px-3 md:px-5 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold text-ink-secondary hover:bg-surface-muted hover:text-ink shrink-0">
            <ArrowLeft size={15} /> Back to Billing
          </button>
          <div className="h-5 w-px bg-hairline hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0"><Receipt size={15} /></span>
            <span className="font-bold text-ink text-[14px] truncate">{inv.invoiceNo}</span>
            <Badge variant={INVOICE_STATUS_VARIANT[inv.status] || 'gray'} dot>{inv.status}</Badge>
          </div>

          <div className="flex-1" />


          {/* Zoom */}
          <div className={`flex items-center gap-0.5 rounded-lg border border-hairline p-0.5 bg-surface shrink-0`}>
            {zoomBtn('100%', zoom === 1, () => setZoom(1))}
            {zoomBtn('125%', zoom === 1.25, () => setZoom(1.25))}
            {zoomBtn('150%', zoom === 1.5, () => setZoom(1.5))}
            {zoomBtn('Fit Width', zoom === 'fitWidth', () => setZoom('fitWidth'))}
            {zoomBtn('Fit Page', zoom === 'fitPage', () => setZoom('fitPage'))}
          </div>

          {/* Primary actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" icon={<Printer size={14} />} onClick={printDoc}>Print</Button>
            <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={printDoc}>PDF</Button>
            <Button size="sm" variant="outline" icon={<Mail size={14} />} onClick={email} loading={busy}>Email</Button>
            {!settled && <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={openPayment}>Record Payment</Button>}
            {!settled && <Button size="sm" icon={<CheckCircle2 size={14} />} onClick={markPaid}>Mark Paid</Button>}

            {/* Secondary actions — kept available without cluttering the bar */}
            <div className="relative">
              <button onClick={() => setMoreOpen((v) => !v)} title="More actions"
                className="h-8 w-8 grid place-items-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-muted">
                <MoreHorizontal size={16} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-hairline bg-surface shadow-lg z-20 py-1">
                    <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={() => { setMoreOpen(false); duplicate(); }} />
                    <MenuItem icon={<RefreshCw size={14} />} label="Regenerate" onClick={() => { setMoreOpen(false); regenerate(); }} />
                    <MenuItem icon={<RotateCcw size={14} />} label="Renew" onClick={() => { setMoreOpen(false); renew(); }} />
                    {!settled && <MenuItem icon={<Ban size={14} />} label="Cancel Invoice" danger onClick={() => { setMoreOpen(false); cancel(); }} />}
                  </div>
                </>
              )}
            </div>

            {/* Collapsible summary toggle (collapsed by default) */}
            <Button size="sm" variant={summaryOpen ? 'primary' : 'outline'}
              icon={summaryOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              onClick={() => setSummaryOpen((v) => !v)}>
              {summaryOpen ? 'Hide' : 'Show'} Invoice Summary
            </Button>
          </div>
        </div>
      </header>

      {/* ══ Body — the invoice is the focus ══ */}
      <div className="px-3 md:px-5 py-5">
        {/* Desktop: invoice ~76% | summary ~24%, side by side and never overlapping
            (both are flex children, so the sidebar can only ever sit BESIDE the
            page, never on top of it). Tablet/mobile: single column, summary below. */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Invoice column — the rendered A4 invoice. The
              values on this same document editable in place (no separate form,
              no separate preview page). Saving reloads the invoice + server HTML
              so Print/PDF always render the latest SAVED invoice. */}
          <div ref={colRef} className="w-full lg:flex-1 min-w-0">
            {/* Scroll horizontally ONLY when the zoomed page is genuinely wider
                than the column — the page is never cropped or hidden. */}
            <div className="w-full overflow-x-auto">
              {/* Outer box reserves the SCALED footprint; the inner element is the
                  true A4 page scaled from its top-left corner, so the visual size
                  and the layout box always agree (no spill onto the sidebar). */}
              <div style={{ width: A4_W * viewScale, height: docH * viewScale, margin: '0 auto' }}>
                {/* No transform at 100% — a transform (even scale(1)) creates a
                    containing block that would break the editor's sticky bar. */}
                <div ref={docRef} style={viewScale === 1
                  ? { width: A4_W }
                  : { width: A4_W, transform: `scale(${viewScale})`, transformOrigin: 'top left' }}>
                  <iframe
                    title="Invoice"
                    srcDoc={html}
                    scrolling="no"
                    onLoad={onFrameLoad}
                    style={{ width: A4_W, height: docH, border: 0, display: 'block', background: '#fff' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right rail — desktop only, 20–25% of the row, never overlapping */}
          {summaryOpen && (
            <aside className="hidden lg:block w-[24%] min-w-[280px] max-w-[360px] shrink-0 space-y-4 sticky top-[68px]">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-ink uppercase tracking-wide">Summary</span>
                <button onClick={() => setSummaryOpen(false)} className="h-7 w-7 grid place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"><X size={15} /></button>
              </div>
              <div className="max-h-[calc(100vh-120px)] overflow-y-auto space-y-4 pr-0.5">{summaryPanels}</div>
            </aside>
          )}
        </div>

        {/* Tablet / mobile — summary stacks below the invoice */}
        {summaryOpen && (
          <div className="lg:hidden mt-5 space-y-4">{summaryPanels}</div>
        )}
      </div>
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-left hover:bg-surface-muted ${danger ? 'text-rose-600' : 'text-ink-secondary'}`}>
    {icon}{label}
  </button>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-hairline bg-surface p-4">
    <div className="text-[12px] font-bold text-ink uppercase tracking-wide mb-2.5">{title}</div>
    <div className="space-y-1.5 text-[13px]">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: any; bold?: boolean; danger?: boolean }> = ({ label, value, bold, danger }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-ink-secondary shrink-0">{label}</span>
    <span className={`tabular-nums text-right truncate ${bold ? 'font-bold' : 'font-medium'} ${danger ? 'text-rose-600' : 'text-ink'}`}>{value}</span>
  </div>
);

export default SubscriptionInvoicePage;
