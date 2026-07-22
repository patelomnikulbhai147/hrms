// ─────────────────────────────────────────────────────────────────────────────
// SERVICE INVOICE — the inline-editable (WYSIWYG) invoice document.
//
// There is NO separate form: every editable value is an input rendered IN PLACE
// inside the invoice, using the same `.si-*` markup and CSS as the printed page
// (serviceInvoice.ts), so what you edit is what prints.
//
// Calculated cells (taxable, GST amount, line total, all summary rows, amount in
// words) are NEVER typed — they are re-derived by computeInvoice() on every
// keystroke, exactly as the server will recompute them on save.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef } from 'react';
import { GripVertical, Plus, Trash2, Copy, Upload, RotateCcw } from 'lucide-react';
import { ui } from '@/components/ui/feedback';
import { ASSET_RULES, acceptAttr, prepareAsset, type AssetKey, type BrandingOverride } from './invoiceAssets';
import { InvoicePicker, type PickerOption } from './InvoicePicker';
import {
  SERVICE_INVOICE_CSS, computeInvoice, resolveIssuer, amountInWords, inr,
  outstandingOf, blankServiceItem, r2, NOT_CONFIGURED, NO_SIGNATURE,
  dispatchRows, destinationRows, hasLogistics, type ServiceItem,
} from './serviceInvoice';

// The editable Dispatch / Destination fields, in the order they appear.
// [docKey, label, placeholder]
const DISPATCH_FIELDS: [string, string, string][] = [
  ['dispatchFrom', 'Dispatch From', 'Warehouse / branch'],
  ['dispatchAddress', 'Address', 'Street address'],
  ['dispatchCity', 'City', 'City'],
  ['dispatchState', 'State', 'State'],
  ['dispatchPincode', 'PIN Code', '380001'],
  ['dispatchDate', 'Dispatch Date', 'yyyy-mm-dd'],
  ['dispatchThrough', 'Dispatched Through', 'Courier / transporter'],
  ['vehicleNumber', 'Vehicle No', 'Optional'],
  ['lrNumber', 'LR / AWB No', 'Optional'],
];
const DESTINATION_FIELDS: [string, string, string][] = [
  ['shipToName', 'Ship To', 'Consignee name'],
  ['billToShipAddress', 'Delivery Address', 'Defaults to billing address'],
  ['shipToCity', 'City', 'City'],
  ['shipToState', 'State', 'State'],
  ['shipToPincode', 'PIN Code', '400001'],
  ['shipToCountry', 'Country', 'India'],
];

// Inject the shared stylesheet once — the same string the print document uses.
let injected = false;
const useServiceInvoiceCss = () => {
  useEffect(() => {
    if (injected) return;
    const el = document.createElement('style');
    el.id = 'service-invoice-css';
    el.textContent = SERVICE_INVOICE_CSS + `
      .si-page input,.si-page textarea{font:inherit;color:inherit;background:transparent;border:0;
        outline:0;padding:0 2px;margin:0 -2px;border-radius:3px;width:100%;resize:none;overflow:hidden}
      .si-page input:hover,.si-page textarea:hover{background:#fffbeb;box-shadow:0 0 0 1px #fde68a}
      .si-page input:focus,.si-page textarea:focus{background:#fff;box-shadow:0 0 0 2px #6366f1}
      .si-page input::placeholder,.si-page textarea::placeholder{color:#cbd5e1}
      .si-page input.num,.si-page input.ctr{text-align:inherit}
      .si-row-tools{position:absolute;left:-30px;top:6px;display:none;flex-direction:column;gap:2px}
      .si-items tr:hover .si-row-tools{display:flex}
      .si-tool{width:22px;height:20px;display:flex;align-items:center;justify-content:center;
        border:1px solid #e5e7eb;background:#fff;border-radius:4px;color:#64748b;cursor:pointer}
      .si-tool:hover{color:#4338ca;border-color:#a5b4fc}
      .si-drop{outline:2px dashed #6366f1;outline-offset:-2px}
      .si-addrow{border:1px dashed #cbd5e1;color:#6366f1;background:#fff;width:100%;padding:5px;
        font-size:10.5px;font-weight:700;cursor:pointer;border-radius:0 0 4px 4px}
      .si-addrow:hover{background:#eef2ff}
      /* Branding asset slots — the image is always contained, never stretched,
         and the slot itself can never grow past the cell it sits in (a wide logo
         used to push against the invoice frame). */
      .si-slot{position:relative;display:inline-flex;align-items:center;justify-content:center;max-width:100%}
      .si-slot img{max-width:100%;max-height:100%;object-fit:contain}
      .si-upload{display:inline-flex;align-items:center;gap:4px;border:1px dashed #a5b4fc;color:#4f46e5;
        background:#eef2ff;border-radius:5px;padding:4px 8px;font-size:9.5px;font-weight:700;
        cursor:pointer;white-space:nowrap;line-height:1.2}
      .si-upload:hover{background:#e0e7ff}
      .si-upload:disabled{opacity:.6;cursor:default}
      /* Replace / Reset buttons sit INSIDE the slot. They used to be offset to
         top:-7px right:-7px, which put them outside the header cell and painted
         over the invoice frame's border — the border looked cut wherever a slot
         touched it. Keeping them inside cannot break the frame at any zoom. */
      .si-slot-tools{position:absolute;top:1px;right:1px;display:none;gap:2px;z-index:2;
        background:rgba(255,255,255,.92);border-radius:4px;padding:1px}
      .si-slot:hover .si-slot-tools{display:flex}
    `;
    document.head.appendChild(el);
    injected = true;
  }, []);
};

export interface ServiceInvoiceDoc {
  invoiceNumber?: string; invoiceDate?: string; dueDate?: string;
  contractNo?: string; referenceNo?: string; poNumber?: string; billingPeriod?: string;
  billToName?: string; billToAddress?: string; billToCity?: string; billToState?: string;
  billToCountry?: string; billToGstin?: string; billToPan?: string; billToEmail?: string;
  billToPhone?: string; billToContact?: string;
  placeOfSupply?: string; paymentTerms?: string; paymentMode?: string;
  notes?: string; termsConditions?: string; bankDetails?: string; upiId?: string;
  amountPaid?: number;
  // Dispatch & Destination. billToShipAddress doubles as the delivery address.
  billToShipAddress?: string;
  dispatchFrom?: string; dispatchAddress?: string; dispatchCity?: string;
  dispatchState?: string; dispatchPincode?: string; dispatchDate?: string;
  dispatchThrough?: string; vehicleNumber?: string; lrNumber?: string;
  shipToName?: string; shipToCity?: string; shipToState?: string;
  shipToPincode?: string; shipToCountry?: string;
  items: ServiceItem[];
}

interface Props {
  doc: ServiceInvoiceDoc;
  onChange: (patch: Partial<ServiceInvoiceDoc>) => void;
  company: any;
  settings: any;
  /** Customer state === company state → CGST+SGST, else IGST. */
  intraState: boolean;
  readOnly?: boolean;
  qrDataUrl?: string;
  /** Template switch for the Dispatch & Destination section. Defaults to on. */
  showLogistics?: boolean;
  /** Per-invoice asset override {logo,signature,stamp,qr} — this invoice only. */
  override?: BrandingOverride;
  onOverrideChange?: (next: BrandingOverride) => void;

  // ── Master data for the in-document pickers (Customers / Products & Services).
  // Supplied by the editor, which owns the API calls; this component never
  // fetches. Omitting them degrades the fields to plain text inputs.
  customers?: any[];
  products?: any[];
  /** Fill the whole Bill-To section from a customer record. */
  onPickCustomer?: (customerId: any) => void;
  /** Fill one item row from a product record. */
  onPickProduct?: (index: number, product: any) => void;
  onCreateCustomer?: () => void;
  onCreateProduct?: (index: number) => void;
}

// ── Inline primitives (controlled inputs — no contentEditable, so the caret
// never jumps while every dependent total is recalculating). ─────────────────
const Txt: React.FC<{ value: any; onChange: (v: string) => void; placeholder?: string; className?: string; readOnly?: boolean; style?: React.CSSProperties }> =
  ({ value, onChange, placeholder, className, readOnly, style }) => readOnly
    ? <span className={className} style={style}>{String(value ?? '') || <span style={{ color: '#cbd5e1' }}>{placeholder}</span>}</span>
    : <input className={className} style={style} value={String(value ?? '')} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;

const Area: React.FC<{ value: any; onChange: (v: string) => void; placeholder?: string; className?: string; readOnly?: boolean; rows?: number }> =
  ({ value, onChange, placeholder, className, readOnly, rows = 2 }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
    return readOnly
      ? <div className={className} style={{ whiteSpace: 'pre-wrap' }}>{String(value ?? '')}</div>
      : <textarea ref={ref} rows={rows} className={className} value={String(value ?? '')} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  };

const Num: React.FC<{ value: any; onChange: (v: number) => void; className?: string; readOnly?: boolean; step?: number }> =
  ({ value, onChange, className, readOnly, step = 1 }) => readOnly
    ? <span className={className}>{inr(value)}</span>
    : <input type="number" min={0} step={step} className={className} style={{ textAlign: 'inherit' }}
        value={String(value ?? 0)} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />;

const GST_RATES = [0, 5, 12, 18, 28];

/**
 * An image slot that doubles as its own uploader. When empty it shows the
 * "Upload …" call to action IN PLACE on the invoice; when filled, hovering
 * offers Replace / Reset-to-default. The image is always `object-fit: contain`,
 * so it is scaled to the slot without ever being stretched.
 */
const AssetSlot: React.FC<{
  kind: AssetKey; src: string; className?: string; boxStyle?: React.CSSProperties;
  readOnly?: boolean; overridden?: boolean;
  onUpload: (dataUrl: string) => void; onReset: () => void;
}> = ({ kind, src, className, boxStyle, readOnly, overridden, onUpload, onReset }) => {
  const rule = ASSET_RULES[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  // `busy` MUST be cleared in `finally`: prepareAsset reads the file, and a read
  // error used to throw straight past `setBusy(false)`, leaving this uploader
  // permanently disabled with no way back except a page reload.
  const pick = async (file?: File | null) => {
    setBusy(true);
    try {
      const res = await prepareAsset(kind, file);
      if (!res.ok) { ui.toast.error(res.error); return; }
      onUpload(res.dataUrl);
      ui.toast.success(`${rule.label} updated${res.note ? ` · ${res.note}` : ''}.`);
    } catch (e) {
      console.error('[invoice] asset upload failed', e);
      ui.toast.error('Could not read that file. Please try another image.');
    } finally { setBusy(false); }
  };

  if (readOnly && !src) return null;
  if (readOnly) return <img src={src} alt={rule.label} className={className} style={boxStyle} />;

  return (
    <div className="si-slot" style={boxStyle}>
      <input ref={inputRef} type="file" accept={acceptAttr(kind)} style={{ display: 'none' }}
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {src
        ? <img src={src} alt={rule.label} className={className} />
        : (
          <button type="button" className="si-upload" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={12} /> {busy ? 'Processing…' : rule.emptyText}
          </button>
        )}
      {src && (
        <span className="si-slot-tools">
          <span className="si-tool" title={`Replace ${rule.label.toLowerCase()}`} onClick={() => inputRef.current?.click()}><Upload size={10} /></span>
          {overridden && <span className="si-tool" title="Use the company default again" onClick={onReset}><RotateCcw size={10} /></span>}
        </span>
      )}
    </div>
  );
};

export const ServiceInvoiceDocument: React.FC<Props> = ({
  doc, onChange, company, settings, intraState, readOnly, qrDataUrl, override, onOverrideChange,
  showLogistics = true,
  customers, products, onPickCustomer, onPickProduct, onCreateCustomer, onCreateProduct,
}) => {
  useServiceInvoiceCss();

  // Read-only rows come from the print renderer's own descriptions, so preview
  // and PDF always show the same fields in the same order.
  const logisticsDispatch = useMemo(() => dispatchRows(doc), [doc]);
  const logisticsDestination = useMemo(() => destinationRows(doc), [doc]);

  // ── Picker options ─────────────────────────────────────────────────────────
  // `search` is pre-lowercased and pre-joined once per list change, so filtering
  // thousands of records is a plain substring test per keystroke.
  const customerOptions: PickerOption[] = useMemo(() => (customers || []).map((c: any) => ({
    id: c.id,
    label: c.companyName || c.contactPerson || 'Unnamed customer',
    sub: [c.gstin && `GSTIN: ${c.gstin}`, c.contactPerson, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    meta: c.customerCode || '',
    // Searchable by name, company, GSTIN, mobile and email.
    search: [c.companyName, c.contactPerson, c.gstin, c.pan, c.phone, c.email, c.customerCode, c.city, c.state]
      .filter(Boolean).join(' ').toLowerCase(),
  })), [customers]);

  const productOptions: PickerOption[] = useMemo(() => (products || []).map((p: any) => ({
    id: p.id,
    label: p.name || 'Unnamed item',
    sub: [p.hsnSac && `HSN/SAC: ${p.hsnSac}`, p.description].filter(Boolean).join(' · '),
    meta: `${inr(p.rate)} · ${p.taxRate ?? 0}%`,
    // Searchable by name, SKU and HSN/SAC.
    search: [p.name, p.sku, p.code, p.hsnSac, p.description, p.unit].filter(Boolean).join(' ').toLowerCase(),
  })), [products]);

  // Assets resolve override → company default → Company Profile (invoiceAssets).
  const ov = override || {};
  const iss = resolveIssuer(company, settings, ov);
  const setAsset = (k: AssetKey, v: string | null) => {
    const next: BrandingOverride = { ...ov };
    if (v) next[k] = v; else delete next[k];
    onOverrideChange?.(next);
  };
  // Bank details: edited as fields, stored as the labelled block the PDF prints.
  // Placeholders show the Company Profile values, so leaving a field blank means
  // "keep using the profile" rather than "blank it out".

  const slot = (k: AssetKey, src: string, className?: string, boxStyle?: React.CSSProperties) => (
    <AssetSlot kind={k} src={src} className={className} boxStyle={boxStyle} readOnly={readOnly}
      overridden={!!ov[k]} onUpload={(d) => setAsset(k, d)} onReset={() => setAsset(k, null)} />
  );
  const items = doc.items?.length ? doc.items : [blankServiceItem()];
  const t = useMemo(() => computeInvoice(items, intraState), [items, intraState]);
  const paid = r2(doc.amountPaid);
  const due = outstandingOf(t.grandTotal, paid);

  const set = (k: keyof ServiceInvoiceDoc, v: any) => onChange({ [k]: v } as any);
  const setItem = (i: number, patch: Partial<ServiceItem>) =>
    onChange({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const addRow = () => onChange({ items: [...items, blankServiceItem()] });
  const dupRow = (i: number) => onChange({ items: [...items.slice(0, i + 1), { ...items[i], id: blankServiceItem().id }, ...items.slice(i + 1)] });
  const delRow = (i: number) => onChange({ items: items.length > 1 ? items.filter((_, j) => j !== i) : items });

  // Drag & drop reorder (HTML5 DnD — no dependency).
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const drop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null; setDragOver(null);
    if (from == null || from === to) return;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange({ items: next });
  };

  // Header rows: shown ALWAYS while editing (so they can be filled in), but only
  // when they carry a value once read-only — matching the printed document.
  const META: [string, keyof ServiceInvoiceDoc, string][] = [
    ['Invoice No.', 'invoiceNumber', 'Auto'],
    ['Invoice Date', 'invoiceDate', ''],
    ['Due Date', 'dueDate', ''],
    ['Contract No.', 'contractNo', '—'],
    ['Reference No.', 'referenceNo', '—'],
    ['P.O. No.', 'poNumber', '—'],
    ['Billing Period', 'billingPeriod', 'e.g. 01/06/2026 – 30/06/2026'],
  ];
  const sac = items.map((i) => i.hsnSac).filter(Boolean)[0] || '';

  const totalRows: { k: string; v: number; cls?: string }[] = [{ k: 'Subtotal', v: t.subtotal }];
  if (t.discountTotal > 0) totalRows.push({ k: 'Discount', v: -t.discountTotal });
  totalRows.push({ k: 'Taxable Amount', v: t.taxableAmount });
  if (intraState) {
    if (t.cgst > 0) totalRows.push({ k: 'CGST', v: t.cgst });
    if (t.sgst > 0) totalRows.push({ k: 'SGST', v: t.sgst });
  } else if (t.igst > 0) totalRows.push({ k: 'IGST', v: t.igst });
  if (t.roundOff !== 0) totalRows.push({ k: 'Round Off', v: t.roundOff });

  return (
    <div className="si-page">
      <div className="si-frame">
        {/* ── HEADER ── */}
        <div className="si-head">
          <div className="si-head-l">
            {slot('logo', iss.logo, 'si-logo', { maxHeight: 46, maxWidth: 170, marginBottom: 6 })}
            {/* Legal entity first — identical markup/CSS to serviceInvoiceHtml so
                screen === print === PDF. The branch follows the company block. */}
            <div className="si-co-name">{iss.name}</div>
            {iss.address && <div className="si-co-line">{iss.address}</div>}
            {iss.phone && <div className="si-co-line">Phone: {iss.phone}</div>}
            {iss.email && <div className="si-co-line">Email: {iss.email}</div>}
            {iss.website && <div className="si-co-line">{iss.website}</div>}
            <div className="si-co-stat">GSTIN: {iss.gstin || <span className="si-missing">{NOT_CONFIGURED}</span>}</div>
            <div className="si-co-stat">PAN: {iss.pan || <span className="si-missing">{NOT_CONFIGURED}</span>}</div>
            {iss.cin && <div className="si-co-stat">CIN: {iss.cin}</div>}
            {/* Operating location — stated separately below the legal identity. */}
            {iss.branchLabel && <div className="si-co-branch">Branch: {iss.branchLabel}</div>}
            {/* Everything above is read LIVE from Company Profile — never typed
                here, and never cached, so a profile change shows immediately. */}
            {!readOnly && (!iss.logo || !iss.gstin) && (
              <div className="si-co-line" style={{ color: '#94a3b8' }}>
                Missing details come from <b>Company Profile</b> → Branding &amp; Statutory.
              </div>
            )}
          </div>
          <div className="si-head-r">
            <div className="si-title">TAX INVOICE</div>
            <table className="si-meta"><tbody>
              {META.filter(([, k]) => !readOnly || String((doc as any)[k] ?? '').trim()).map(([label, key, ph]) => (
                <tr key={key}>
                  <td className="k">{label}</td>
                  <td className="v">
                    {key === 'invoiceDate' || key === 'dueDate'
                      ? (readOnly ? String(doc[key] ?? '') : <input type="date" value={String(doc[key] ?? '')} onChange={(e) => set(key, e.target.value)} />)
                      : <Txt value={doc[key]} onChange={(v) => set(key, v)} placeholder={ph} readOnly={readOnly} />}
                  </td>
                </tr>
              ))}
              {!!sac && <tr><td className="k">SAC / HSN</td><td className="v">{sac}</td></tr>}
            </tbody></table>
          </div>
        </div>

        {/* ── BILL TO ── */}
        <div className="si-bill">
          <div className="si-bill-l">
            <div className="si-lbl">Bill To</div>
            {/* Searchable customer list. Picking one fills the whole Bill-To
                section; typing a name that matches nothing still works, so a
                one-off customer never needs a master record first. */}
            {onPickCustomer
              ? <InvoicePicker className="si-bill-name" menuWidth={340}
                  value={doc.billToName || ''} onChange={(v) => set('billToName', v)}
                  onSelect={(o) => onPickCustomer(o.id)}
                  options={customerOptions} placeholder="Search customer…" readOnly={readOnly}
                  createLabel={onCreateCustomer ? 'Create New Customer' : undefined}
                  onCreate={onCreateCustomer} emptyLabel="No customers found." />
              : <Txt className="si-bill-name" value={doc.billToName} onChange={(v) => set('billToName', v)} placeholder="Customer / company name" readOnly={readOnly} />}
            <Area className="si-bill-line" value={doc.billToAddress} onChange={(v) => set('billToAddress', v)} placeholder="Address" readOnly={readOnly} />
            <div className="si-bill-line" style={{ display: 'flex', gap: 4 }}>
              <Txt value={doc.billToCity} onChange={(v) => set('billToCity', v)} placeholder="City" readOnly={readOnly} />
              <Txt value={doc.billToState} onChange={(v) => set('billToState', v)} placeholder="State" readOnly={readOnly} />
              <Txt value={doc.billToCountry} onChange={(v) => set('billToCountry', v)} placeholder="Country" readOnly={readOnly} />
            </div>
            <div className="si-bill-line" style={{ display: 'flex', gap: 4 }}>
              <span style={{ color: '#6b7280' }}>GSTIN</span><Txt value={doc.billToGstin} onChange={(v) => set('billToGstin', v)} placeholder="—" readOnly={readOnly} />
              <span style={{ color: '#6b7280' }}>PAN</span><Txt value={doc.billToPan} onChange={(v) => set('billToPan', v)} placeholder="—" readOnly={readOnly} />
            </div>
            <div className="si-bill-line" style={{ display: 'flex', gap: 4 }}>
              <Txt value={doc.billToEmail} onChange={(v) => set('billToEmail', v)} placeholder="Email" readOnly={readOnly} />
              <Txt value={doc.billToPhone} onChange={(v) => set('billToPhone', v)} placeholder="Phone" readOnly={readOnly} />
            </div>
            <div className="si-bill-line" style={{ display: 'flex', gap: 4 }}>
              <span style={{ color: '#6b7280' }}>Contact</span>
              <Txt value={doc.billToContact} onChange={(v) => set('billToContact', v)} placeholder="Contact person" readOnly={readOnly} />
            </div>
          </div>
          <div className="si-bill-r">
            <div className="si-lbl">Place of Supply</div>
            <Txt className="si-bill-line" value={doc.placeOfSupply ?? doc.billToState} onChange={(v) => set('placeOfSupply', v)} placeholder="State" readOnly={readOnly} />
            <div className="si-lbl" style={{ marginTop: 6 }}>Payment Terms</div>
            <Txt className="si-bill-line" value={doc.paymentTerms} onChange={(v) => set('paymentTerms', v)} placeholder="e.g. Net 30" readOnly={readOnly} />
            <div className="si-lbl" style={{ marginTop: 6 }}>GST Treatment</div>
            <div className="si-bill-line">{intraState ? 'Intra-state · CGST + SGST' : 'Inter-state · IGST'}</div>
          </div>
        </div>

        {/* ── DISPATCH & DESTINATION ──
            Editable here, read-only in preview. In read-only mode the rows come
            from the SAME dispatchRows/destinationRows the print document uses,
            so the on-screen invoice and the PDF can never list different fields.
            The whole block hides when the template switches it off, and in
            read-only mode it also hides when there is nothing to show — a
            services business that never ships sees no change. */}
        {showLogistics && (readOnly ? hasLogistics(doc) : true) && (
          <div className="si-bill">
            <div className="si-bill-l">
              <div className="si-lbl">Dispatch Details</div>
              {readOnly
                ? logisticsDispatch.map((r) => (
                    <div className="si-kv" key={r.label}><span style={{ minWidth: 104 }}>{r.label}</span><span style={{ whiteSpace: 'pre-wrap' }}>{r.value}</span></div>
                  ))
                : DISPATCH_FIELDS.map(([key, label, ph]) => (
                    <div className="si-kv" key={key}>
                      <span style={{ minWidth: 104 }}>{label}</span>
                      <Txt value={(doc as any)[key]} onChange={(v) => set(key as any, v)} placeholder={ph} />
                    </div>
                  ))}
            </div>
            <div className="si-bill-r">
              <div className="si-lbl">Destination Details</div>
              {readOnly
                ? logisticsDestination.map((r) => (
                    <div className="si-kv" key={r.label}><span style={{ minWidth: 104 }}>{r.label}</span><span style={{ whiteSpace: 'pre-wrap' }}>{r.value}</span></div>
                  ))
                : DESTINATION_FIELDS.map(([key, label, ph]) => (
                    <div className="si-kv" key={key}>
                      <span style={{ minWidth: 104 }}>{label}</span>
                      <Txt value={(doc as any)[key]} onChange={(v) => set(key as any, v)} placeholder={ph} />
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* ── ITEMS ── */}
        <table className="si-items">
          <thead><tr>
            <th style={{ width: '5%' }}>Sr</th><th style={{ width: '31%' }}>Particulars / Service Description</th>
            <th style={{ width: '10%' }}>Rate</th><th style={{ width: '8%' }}>Qty</th><th style={{ width: '7%' }}>Disc %</th>
            <th style={{ width: '11%' }}>Taxable</th>
            <th style={{ width: '7%' }}>GST %</th><th style={{ width: '10%' }}>GST Amt</th><th style={{ width: '11%' }}>Total</th>
          </tr></thead>
          <tbody>
            {t.lines.map((l: any, i: number) => (
              <tr key={items[i].id || i}
                className={dragOver === i ? 'si-drop' : undefined}
                onDragOver={(e) => { if (dragFrom.current != null) { e.preventDefault(); setDragOver(i); } }}
                onDrop={(e) => { e.preventDefault(); drop(i); }}>
                <td className="ctr" style={{ position: 'relative' }}>
                  {!readOnly && (
                    <div className="si-row-tools">
                      <span className="si-tool" title="Drag to reorder" draggable
                        onDragStart={() => { dragFrom.current = i; }} onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}>
                        <GripVertical size={12} />
                      </span>
                      <span className="si-tool" title="Duplicate row" onClick={() => dupRow(i)}><Copy size={11} /></span>
                      <span className="si-tool" title="Delete row" onClick={() => delRow(i)}><Trash2 size={11} /></span>
                    </div>
                  )}
                  {i + 1}
                </td>
                <td>
                  {/* Searchable product / service list. Picking one fills the
                      description, HSN/SAC, unit, rate, GST% and any configured
                      discount; free text still creates a one-off line. */}
                  {onPickProduct
                    ? <InvoicePicker className="si-desc" menuWidth={360}
                        value={items[i].name || ''} onChange={(v) => setItem(i, { name: v })}
                        onSelect={(o) => onPickProduct(i, (products || []).find((p: any) => String(p.id) === String(o.id)))}
                        options={productOptions} placeholder="Search product / service…" readOnly={readOnly}
                        createLabel={onCreateProduct ? 'Create New Product' : undefined}
                        onCreate={onCreateProduct ? () => onCreateProduct(i) : undefined}
                        emptyLabel="No products found." />
                    : <Txt className="si-desc" value={items[i].name} onChange={(v) => setItem(i, { name: v })} placeholder="Service description" readOnly={readOnly} />}
                  <Area className="si-sub" value={items[i].description} onChange={(v) => setItem(i, { description: v })} placeholder="Additional details (optional)" readOnly={readOnly} rows={1} />
                  <div className="si-sub" style={{ display: 'flex', gap: 4 }}>
                    <span>SAC/HSN</span>
                    <Txt value={items[i].hsnSac} onChange={(v) => setItem(i, { hsnSac: v })} placeholder="—" readOnly={readOnly} />
                  </div>
                </td>
                <td className="num"><Num value={items[i].rate} onChange={(v) => setItem(i, { rate: v })} readOnly={readOnly} step={0.01} /></td>
                <td className="ctr"><Num value={items[i].quantity} onChange={(v) => setItem(i, { quantity: v })} readOnly={readOnly} step={0.01} /></td>
                {/* Optional per-line discount — auto-filled from the product when
                    it has one configured, editable either way. */}
                <td className="ctr"><Num value={items[i].discountPct ?? 0} onChange={(v) => setItem(i, { discountPct: v, discountAmt: undefined })} readOnly={readOnly} step={0.01} /></td>
                {/* calculated — never typed */}
                <td className="num">{inr(l.taxableValue)}</td>
                <td className="ctr">
                  {readOnly ? `${inr(l.taxRate)}%` : (
                    <select value={String(items[i].taxRate ?? 0)} onChange={(e) => setItem(i, { taxRate: Number(e.target.value) })}
                      style={{ border: 0, background: 'transparent', font: 'inherit', width: '100%' }}>
                      {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  )}
                </td>
                <td className="num">{inr(l.taxAmount)}</td>
                <td className="num">{inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && <button type="button" className="si-addrow" onClick={addRow}><Plus size={11} style={{ display: 'inline', verticalAlign: -2 }} /> Add Row</button>}

        {/* ── NOTES + TOTALS ── */}
        <div className="si-foot">
          <div className="si-foot-l">
            <div className="si-lbl">Notes</div>
            <Area className="si-terms" value={doc.notes} onChange={(v) => set('notes', v)} placeholder="Notes visible to the customer…" readOnly={readOnly} />
          </div>
          <div className="si-foot-r">
            <table className="si-tot"><tbody>
              {totalRows.map((r) => (
                <tr key={r.k}><td className="k">{r.k}</td><td className="v">{r.v < 0 ? `- ${inr(Math.abs(r.v))}` : inr(r.v)}</td></tr>
              ))}
              <tr className="grand"><td className="k" style={{ color: '#fff' }}>Grand Total</td><td className="v" style={{ color: '#fff' }}>₹{inr(t.grandTotal)}</td></tr>
              {paid > 0 && <tr><td className="k">Amount Paid</td><td className="v">{inr(paid)}</td></tr>}
              {paid > 0 && <tr className="due"><td className="k">Outstanding / Balance</td><td className="v">{inr(due)}</td></tr>}
            </tbody></table>
          </div>
        </div>

        {/* ── AMOUNT IN WORDS (auto) ── */}
        <div className="si-words"><b>Amount in Words</b><br />{amountInWords(t.grandTotal)}</div>

        {/* Payment Details (bank block, payment mode, UPI ID, QR panel) was
            removed from the invoice layout — on screen, in print, in the PDF and
            in the emailed copy. The editor and serviceInvoice.ts render the same
            markup, so both had to drop it together or preview would stop
            matching print. */}

        {/* ── TERMS + SIGNATORY ── */}
        <div className="si-end">
          <div className="si-end-l">
            <div className="si-lbl">Terms &amp; Conditions</div>
            <Area className="si-terms" value={doc.termsConditions} onChange={(v) => set('termsConditions', v)} rows={3}
              placeholder="1. Payment due within the agreed credit period.&#10;2. Subject to jurisdiction." readOnly={readOnly} />
          </div>
          <div className="si-end-r">
            <div>
              <div className="si-lbl">For {iss.name}</div>
              {iss.seal
                ? slot('stamp', iss.seal, 'si-stamp', { width: 78, height: 78, margin: '4px auto 0' })
                : <div className="si-seal">{readOnly ? <>COMPANY<br />SEAL</> : slot('stamp', '')}</div>}
            </div>
            <div>
              {iss.signature
                ? slot('signature', iss.signature, 'si-sign', { height: 38, margin: '0 auto' })
                : (readOnly
                    ? <div className="si-sign si-missing" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{NO_SIGNATURE}</div>
                    : slot('signature', '', undefined, { height: 38 }))}
              {iss.signatureText && <div className="si-sign-name">{iss.signatureText}</div>}
              <div className="si-sign-lbl">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
      <div className="si-note">{iss.footerText}</div>
    </div>
  );
};

export default ServiceInvoiceDocument;
