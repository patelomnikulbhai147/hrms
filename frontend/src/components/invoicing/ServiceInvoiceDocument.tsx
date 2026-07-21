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
import {
  SERVICE_INVOICE_CSS, computeInvoice, resolveIssuer, amountInWords, inr,
  outstandingOf, blankServiceItem, r2, NOT_CONFIGURED, NO_SIGNATURE,
  BANK_FIELDS, parseBank, serialiseBank, type ServiceItem,
} from './serviceInvoice';

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
      /* Branding asset slots — the image is always contained, never stretched. */
      .si-slot{position:relative;display:inline-flex;align-items:center;justify-content:center}
      .si-slot img{max-width:100%;max-height:100%;object-fit:contain}
      .si-upload{display:inline-flex;align-items:center;gap:4px;border:1px dashed #a5b4fc;color:#4f46e5;
        background:#eef2ff;border-radius:5px;padding:4px 8px;font-size:9.5px;font-weight:700;
        cursor:pointer;white-space:nowrap;line-height:1.2}
      .si-upload:hover{background:#e0e7ff}
      .si-upload:disabled{opacity:.6;cursor:default}
      .si-slot-tools{position:absolute;top:-7px;right:-7px;display:none;gap:2px}
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
  /** Per-invoice asset override {logo,signature,stamp,qr} — this invoice only. */
  override?: BrandingOverride;
  onOverrideChange?: (next: BrandingOverride) => void;
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

  const pick = async (file?: File | null) => {
    setBusy(true);
    const res = await prepareAsset(kind, file);
    setBusy(false);
    if (!res.ok) { ui.toast.error(res.error); return; }
    onUpload(res.dataUrl);
    ui.toast.success(`${rule.label} updated${res.note ? ` · ${res.note}` : ''}.`);
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

export const ServiceInvoiceDocument: React.FC<Props> = ({ doc, onChange, company, settings, intraState, readOnly, qrDataUrl, override, onOverrideChange }) => {
  useServiceInvoiceCss();
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
  const bank = useMemo(() => parseBank(doc.bankDetails), [doc.bankDetails]);
  const bankDefaults = useMemo(() => parseBank(iss.bankDetails), [iss.bankDetails]);
  const setBankField = (label: string, v: string) =>
    set('bankDetails', serialiseBank({ ...bank, [label]: v }));

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
            <div className="si-co-name">{iss.name}</div>
            {iss.address && <div className="si-co-line">{iss.address}</div>}
            {iss.phone && <div className="si-co-line">Phone: {iss.phone}</div>}
            {iss.email && <div className="si-co-line">Email: {iss.email}</div>}
            {iss.website && <div className="si-co-line">{iss.website}</div>}
            <div className="si-co-stat">GSTIN: {iss.gstin || <span className="si-missing">{NOT_CONFIGURED}</span>}</div>
            <div className="si-co-stat">PAN: {iss.pan || <span className="si-missing">{NOT_CONFIGURED}</span>}</div>
            {iss.cin && <div className="si-co-stat">CIN: {iss.cin}</div>}
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
            <Txt className="si-bill-name" value={doc.billToName} onChange={(v) => set('billToName', v)} placeholder="Customer / company name" readOnly={readOnly} />
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

        {/* ── ITEMS ── */}
        <table className="si-items">
          <thead><tr>
            <th style={{ width: '6%' }}>Sr</th><th style={{ width: '34%' }}>Particulars / Service Description</th>
            <th style={{ width: '11%' }}>Rate</th><th style={{ width: '9%' }}>Qty</th><th style={{ width: '12%' }}>Taxable</th>
            <th style={{ width: '8%' }}>GST %</th><th style={{ width: '10%' }}>GST Amt</th><th style={{ width: '12%' }}>Total</th>
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
                  <Txt className="si-desc" value={items[i].name} onChange={(v) => setItem(i, { name: v })} placeholder="Service description" readOnly={readOnly} />
                  <Area className="si-sub" value={items[i].description} onChange={(v) => setItem(i, { description: v })} placeholder="Additional details (optional)" readOnly={readOnly} rows={1} />
                  <div className="si-sub" style={{ display: 'flex', gap: 4 }}>
                    <span>SAC/HSN</span>
                    <Txt value={items[i].hsnSac} onChange={(v) => setItem(i, { hsnSac: v })} placeholder="—" readOnly={readOnly} />
                  </div>
                </td>
                <td className="num"><Num value={items[i].rate} onChange={(v) => setItem(i, { rate: v })} readOnly={readOnly} step={0.01} /></td>
                <td className="ctr"><Num value={items[i].quantity} onChange={(v) => setItem(i, { quantity: v })} readOnly={readOnly} step={0.01} /></td>
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

        {/* ── BANK / PAYMENT ── */}
        <div className="si-bank">
          <div className="si-bank-l">
            <div className="si-lbl">Bank Details</div>
            {/* Structured fields that serialise to the labelled block the PDF
                prints. All blank → the live Company Profile bank block. */}
            {readOnly
              ? (doc.bankDetails || iss.bankDetails
                  ? <div className="si-terms" style={{ whiteSpace: 'pre-wrap' }}>{doc.bankDetails || iss.bankDetails}</div>
                  : <div className="si-terms si-missing">{NOT_CONFIGURED}</div>)
              : BANK_FIELDS.map((label) => (
                  <div className="si-kv" key={label}>
                    <span style={{ minWidth: 84 }}>{label}</span>
                    <Txt value={bank[label] || ''} onChange={(v) => setBankField(label, v)} placeholder={bankDefaults[label] || '—'} />
                  </div>
                ))}
          </div>
          <div className="si-bank-r">
            <div style={{ flex: 1 }}>
              <div className="si-lbl">Payment</div>
              <div className="si-kv"><span>Mode</span><Txt value={doc.paymentMode} onChange={(v) => set('paymentMode', v)} placeholder="NEFT / UPI / Cheque" readOnly={readOnly} /></div>
              <div className="si-kv"><span>UPI ID</span><Txt value={doc.upiId || iss.upiId} onChange={(v) => set('upiId', v)} placeholder="name@bank" readOnly={readOnly} /></div>
            </div>
            <div className="si-qr">
              {(qrDataUrl || iss.qr)
                ? slot('qr', qrDataUrl || iss.qr, undefined, { width: '100%', height: '100%' })
                : (readOnly ? <span className="si-missing">Scan &amp;<br />Pay QR</span> : slot('qr', ''))}
            </div>
          </div>
        </div>

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
