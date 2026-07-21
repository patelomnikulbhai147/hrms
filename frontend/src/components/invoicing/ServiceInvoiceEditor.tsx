// ─────────────────────────────────────────────────────────────────────────────
// CREATE / EDIT INVOICE — the WYSIWYG experience.
//
// The invoice itself IS the editor: there is no separate form. A thin action bar
// carries Save / Generate / Print / Email / Cancel and the optional "load from
// Client Master" convenience picker; everything else is typed directly on the
// A4 page below it.
//
// Money is never typed: computeInvoice() re-derives taxable / GST / totals /
// amount-in-words on every keystroke, and the server recomputes authoritatively
// on save (services/invoiceCalc) — this component never posts totals.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { CheckCircle2, Save, Printer, X, Users, Mail, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { ServiceInvoiceDocument, type ServiceInvoiceDoc } from './ServiceInvoiceDocument';
import { serviceInvoiceHtml, blankServiceItem, A4_W, A4_H, computeInvoice } from './serviceInvoice';
import { parseOverride, serialiseOverride, type BrandingOverride } from './invoiceAssets';
import { useIssuerCompany } from './invoiceIdentity';
import { renderInvoiceHtml, printInvoiceDocument, SYSTEM_TEMPLATE_NAME } from './invoiceRender';
import { CustomerModal, ProductModal } from './MasterModals';

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (iso: string, days: number) => { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

const emptyDoc = (): ServiceInvoiceDoc => ({
  invoiceNumber: '', invoiceDate: todayIso(), dueDate: '',
  contractNo: '', referenceNo: '', poNumber: '', billingPeriod: '',
  billToName: '', billToAddress: '', billToCity: '', billToState: '', billToCountry: 'India',
  billToGstin: '', billToPan: '', billToEmail: '', billToPhone: '', billToContact: '',
  placeOfSupply: '', paymentTerms: 'Net 30', paymentMode: '',
  notes: '', termsConditions: '', bankDetails: '', upiId: '',
  amountPaid: 0, items: [blankServiceItem()],
});

interface Props {
  editId: number | null;
  canEdit: boolean;
  companyState: string;
  company: any;
  onDone: () => void;
}

export const ServiceInvoiceEditor: React.FC<Props> = ({ editId, canEdit, companyState, company, onDone }) => {
  const [doc, setDoc] = useState<ServiceInvoiceDoc>(emptyDoc());
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Per-invoice asset override — empty means "use the company / profile branding".
  const [override, setOverride] = useState<BrandingOverride>({});

  // Fit the A4 page to the available width so the whole invoice is always
  // visible — desktop shows it 1:1, tablet/mobile scale it down, never clipped.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setFit(Math.min(1, (el.clientWidth - 8) / A4_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.max(0.35, Math.min(2, fit * zoom));

  // A CSS transform does not change the layout box, so the wrapper must reserve
  // the SCALED height explicitly — otherwise the page overlaps whatever follows.
  // offsetHeight ignores transforms, so it measures the true unscaled height.
  const docRef = useRef<HTMLDivElement>(null);
  const [docH, setDocH] = useState(A4_H);
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const measure = () => setDocH(Math.max(A4_H, el.offsetHeight || A4_H));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.items.length]);

  const patch = useCallback((p: Partial<ServiceInvoiceDoc>) => setDoc((d) => ({ ...d, ...p })), []);

  // ── COMPANY PROFILE IS THE BRANDING SOURCE ─────────────────────────────────
  // The `company` prop comes from App state, which can be minutes old. Re-read
  // the profile when the editor opens (and whenever the workspace changes) so a
  // logo / signature / GST / bank change made in Company Profile shows on the
  // very next invoice. Nothing is cached; the prop is only a fallback.
  // The LEGAL ENTITY is always the parent company; a branch workspace bills under
  // it and shows only as `branchLabel`. One shared resolver, so this editor, the
  // module shell and every renderer agree on who is issuing the invoice.
  /** The live parent-company row, falling back to whatever App state had. */
  const issuerCompany = useIssuerCompany(company);

  // ── THE TEMPLATE COMES FROM THE TEMPLATE GALLERY ───────────────────────────
  // Create Invoice does not decide what an invoice looks like: it loads whatever
  // template is marked default in Templates & Branding. No default saved ⇒ the
  // built-in "Professional Tax Invoice", which is itself a gallery entry.
  // `activeLayout` is null for the built-in and a canvas layout otherwise.
  const [activeLayout, setActiveLayout] = useState<any>(null);
  const [templateName, setTemplateName] = useState<string>(SYSTEM_TEMPLATE_NAME);
  const loadDefaultTemplate = useCallback(async () => {
    try {
      const rows = (await api.invoicing.listLayouts())?.layouts || [];
      const active = rows.find((l: any) => l.isDefault);
      let parsed = active?.layout;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
      setActiveLayout(active && parsed ? parsed : null);
      setTemplateName(active && parsed ? (active.name || 'Custom Template') : SYSTEM_TEMPLATE_NAME);
    } catch { setActiveLayout(null); setTemplateName(SYSTEM_TEMPLATE_NAME); }
  }, []);
  useEffect(() => { loadDefaultTemplate(); }, [loadDefaultTemplate]);
  // Changing the default in the gallery re-templates Create Invoice immediately.
  useEffect(() => {
    const onChanged = () => loadDefaultTemplate();
    window.addEventListener('hrms:invoice-templates-changed', onChanged);
    return () => window.removeEventListener('hrms:invoice-templates-changed', onChanged);
  }, [loadDefaultTemplate]);

  // ── MASTER DATA for the in-document pickers ────────────────────────────────
  // Customers and Products & Services are read from their own modules — never
  // dummy data — and re-read after an inline create so the new record is
  // immediately selectable. `pendingPick` remembers what to select once the list
  // has refreshed (a customer, or the item row a product was created for).
  const [customerModal, setCustomerModal] = useState<any>(null);
  const [productModal, setProductModal] = useState<any>(null);
  const [productRow, setProductRow] = useState<number | null>(null);

  const reloadCustomers = useCallback(async (selectId?: any) => {
    try {
      const cs = await api.invoicing.listCustomers({ active: 'true' });
      const list = Array.isArray(cs) ? cs : [];
      setCustomers(list);
      return list.find((c: any) => String(c.id) === String(selectId));
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); return undefined; }
  }, []);

  const reloadProducts = useCallback(async (selectId?: any) => {
    try {
      const ps = await api.invoicing.listProducts({ active: 'true' });
      const list = Array.isArray(ps) ? ps : [];
      setProducts(list);
      return list.find((p: any) => String(p.id) === String(selectId));
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); return undefined; }
  }, []);

  /** Save from the inline "+ Create New Customer" modal, then select it. */
  const saveNewCustomer = async (data: any) => {
    try {
      const saved = await api.invoicing.saveCustomer(data.id, data);
      setCustomerModal(null);
      await reloadCustomers(saved?.id);
      if (saved?.id) applyCustomer(saved);
      ui.toast.success('Customer saved and selected.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  /** Save from the inline "+ Create New Product" modal, then fill that row. */
  const saveNewProduct = async (data: any) => {
    try {
      const saved = await api.invoicing.saveProduct(data.id, data);
      setProductModal(null);
      await reloadProducts(saved?.id);
      if (saved && productRow != null) applyProduct(productRow, saved);
      setProductRow(null);
      ui.toast.success('Product saved and added to the invoice.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  /** Fill one item row from a product master record. Quantity is left to the
   *  user; everything else is the product's configured default. */
  const applyProduct = (index: number, p: any) => {
    if (!p) return;
    setDoc((d) => ({
      ...d,
      items: d.items.map((it, i) => i !== index ? it : {
        ...it,
        productId: p.id,
        name: p.name || it.name,
        description: p.description || it.description,
        hsnSac: p.hsnSac || it.hsnSac,
        unit: p.unit || it.unit,
        rate: Number(p.rate) || 0,
        taxRate: p.taxRate == null ? it.taxRate : Number(p.taxRate),
        discountPct: p.discountPct == null ? it.discountPct : Number(p.discountPct),
      }),
    }));
  };

  // Company defaults (Template Settings) seed every NEW invoice — configured
  // once by the Company Head, reused by all future invoices.
  useEffect(() => {
    (async () => {
      try {
        const [cs, ps, st] = await Promise.all([
          api.invoicing.listCustomers({ active: 'true' }),
          api.invoicing.listProducts({ active: 'true' }),
          api.invoicing.getSettings(),
        ]);
        setCustomers(Array.isArray(cs) ? cs : []);
        setProducts(Array.isArray(ps) ? ps : []);
        setSettings(st);
        if (!editId) {
          setDoc((d) => ({
            ...d,
            paymentTerms: d.paymentTerms || st?.defaultPaymentTerms || 'Net 30',
            notes: d.notes || st?.defaultNotes || '',
            termsConditions: d.termsConditions || st?.defaultTerms || '',
            // Bank + UPI are deliberately NOT copied into the document: both the
            // editor and the printed page fall back to the live Company Profile
            // block, so updating the profile updates every invoice. Typing over
            // them here still overrides, per-invoice.
          }));
        }
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    })();
  }, [editId]);

  // Load an existing invoice into the document.
  useEffect(() => {
    if (!editId) { setInvoiceId(null); setOverride({}); return; }
    (async () => {
      try {
        const inv = await api.invoicing.getInvoice(editId);
        setInvoiceId(inv.id);
        setCustomerId(inv.customerId ? String(inv.customerId) : '');
        setOverride(parseOverride(inv.brandingOverride));
        setDoc({
          invoiceNumber: inv.invoiceNumber || '', invoiceDate: inv.invoiceDate || todayIso(), dueDate: inv.dueDate || '',
          contractNo: inv.contractNo || '', referenceNo: inv.referenceNo || '', poNumber: inv.poNumber || '', billingPeriod: inv.billingPeriod || '',
          billToName: inv.billToName || '', billToAddress: inv.billToAddress || '', billToCity: '', billToState: inv.billToState || '',
          billToCountry: 'India', billToGstin: inv.billToGstin || '', billToPan: '', billToEmail: inv.billToEmail || '',
          billToPhone: inv.billToPhone || '', billToContact: '',
          placeOfSupply: inv.placeOfSupply || inv.billToState || '', paymentTerms: inv.paymentTerms || '', paymentMode: inv.paymentMode || '',
          notes: inv.notes || '', termsConditions: inv.termsConditions || '', bankDetails: inv.bankDetails || '', upiId: inv.upiId || '',
          amountPaid: inv.amountPaid || 0,
          items: (inv.items || []).map((it: any, i: number) => ({
            id: `it-${it.id ?? i}`, name: it.name, description: it.description || '', hsnSac: it.hsnSac || '',
            quantity: it.quantity, unit: it.unit || 'Nos', rate: it.rate, discountPct: it.discountPct, taxRate: it.taxRate, productId: it.productId,
          })),
        });
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    })();
  }, [editId]);

  const intraState = !doc.billToState || !companyState
    || String(doc.billToState).trim().toLowerCase() === String(companyState).trim().toLowerCase();

  // Fill the inline Bill-To block from the Client Master (a convenience, not a
  // form — every filled value stays editable on the invoice).
  const pickCustomer = (id: string) => {
    const c = customers.find((x) => String(x.id) === String(id));
    if (!c) { setCustomerId(id); return; }
    applyCustomer(c);
  };

  /** Fill the whole Bill-To section from a customer record. Every field stays
   *  editable afterwards — this only saves the typing. */
  const applyCustomer = (c: any) => {
    setCustomerId(c?.id ? String(c.id) : '');
    if (!c) return;
    setDoc((d) => ({
      ...d,
      billToName: c.companyName || d.billToName,
      billToAddress: c.addressLine || d.billToAddress,
      billToCity: c.city || d.billToCity,
      billToState: c.state || d.billToState,
      billToCountry: c.country || d.billToCountry,
      billToGstin: c.gstin || d.billToGstin,
      billToPan: c.pan || d.billToPan,
      billToEmail: c.email || d.billToEmail,
      billToPhone: c.phone || d.billToPhone,
      billToContact: c.contactPerson || d.billToContact,
      placeOfSupply: c.state || d.placeOfSupply,
      paymentTerms: c.paymentTerms || d.paymentTerms,
      dueDate: (c.creditDays != null && c.creditDays !== '' && d.invoiceDate) ? addDaysIso(d.invoiceDate, Number(c.creditDays)) : d.dueDate,
    }));
  };

  const payload = () => ({
    customerId: customerId || undefined,
    invoiceNumber: doc.invoiceNumber || undefined,
    billToName: doc.billToName, billToGstin: doc.billToGstin,
    billToAddress: [doc.billToAddress, doc.billToCity].filter(Boolean).join(', '),
    billToEmail: doc.billToEmail, billToPhone: doc.billToPhone, billToState: doc.billToState,
    invoiceDate: doc.invoiceDate, dueDate: doc.dueDate || undefined,
    contractNo: doc.contractNo, referenceNo: doc.referenceNo, poNumber: doc.poNumber, billingPeriod: doc.billingPeriod,
    // NULL when nothing is overridden → the invoice keeps following Company Profile.
    brandingOverride: serialiseOverride(override),
    placeOfSupply: doc.placeOfSupply || doc.billToState,
    paymentTerms: doc.paymentTerms, paymentMode: doc.paymentMode,
    notes: doc.notes, termsConditions: doc.termsConditions, bankDetails: doc.bankDetails, upiId: doc.upiId,
    // Totals are deliberately NOT sent — services/invoiceCalc recomputes them.
    items: doc.items.filter((it) => String(it.name || '').trim()).map((it) => ({
      productId: it.productId, name: it.name, description: it.description, hsnSac: it.hsnSac,
      quantity: it.quantity, unit: it.unit, rate: it.rate, discountPct: it.discountPct, taxRate: it.taxRate,
    })),
  });

  const save = async (finalize: boolean) => {
    if (!canEdit) return;
    if (!String(doc.billToName || '').trim() && !customerId) { ui.toast.error('Enter the customer name on the invoice.'); return; }
    if (!doc.items.some((it) => String(it.name || '').trim())) { ui.toast.error('Add at least one line item.'); return; }
    if (doc.dueDate && doc.invoiceDate && doc.dueDate < doc.invoiceDate) { ui.toast.error('Due date cannot be before the invoice date.'); return; }
    setSaving(true);
    try {
      const body = { ...payload(), status: finalize ? 'Generated' : 'Draft', finalize };
      const saved = invoiceId ? await api.invoicing.updateInvoice(invoiceId, body) : await api.invoicing.createInvoice(body);
      ui.toast.success(`Invoice ${saved.invoiceNumber} ${invoiceId ? 'updated' : 'created'}${finalize ? ' & generated' : ' as draft'}.`);
      onDone();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not save the invoice.')); }
    finally { setSaving(false); }
  };

  /** This invoice, rendered through the gallery's DEFAULT template — the one
   *  renderer the preview, the print window, the emailed PDF and the Template
   *  Gallery preview all share. */
  const renderWithDefaultTemplate = (print: boolean) =>
    renderInvoiceHtml({ ...doc, ...computeInvoice(doc.items, intraState), intraState, brandingOverride: override },
      issuerCompany, undefined, activeLayout, { print }, settings);

  // Print / PDF from the SAME definition the screen renders → identical output.
  // Printed via a hidden iframe so the dialog can never wedge this tab (a
  // same-origin popup shares our renderer process — that was the freeze).
  // `printing` is cleared in `finally`, so the button always comes back.
  const printDoc = async () => {
    if (printing) return;                       // ignore a double click
    setPrinting(true);
    try { await printInvoiceDocument(renderWithDefaultTemplate(true)); }
    catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not open the print view.')); }
    finally { setPrinting(false); }
  };

  const emailDoc = async () => {
    if (!invoiceId) { ui.toast.error('Save the invoice before emailing it.'); return; }
    const to = String(doc.billToEmail || '').trim();
    if (!to) { ui.toast.error('Add the customer email on the invoice first.'); return; }
    setEmailing(true);
    try {
      // Send the SAME document the screen shows → the attached PDF is identical.
      const html = renderWithDefaultTemplate(false);
      const res = await api.invoicing.emailInvoice(invoiceId, { to, html });
      ui.toast[res?.delivered ? 'success' : 'info'](res?.delivered
        ? `Invoice emailed to ${to} with the PDF attached.`
        : 'SMTP is not configured — the email was logged on the server instead.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not send the invoice.')); }
    finally { setEmailing(false); }
  };

  const total = useMemo(() => computeInvoice(doc.items, intraState).grandTotal, [doc.items, intraState]);

  return (
    <div ref={wrapRef} className="min-w-0">
      {/* Action bar — the ONLY chrome; the invoice below is the editor. */}
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <Users size={13} className="text-brand-500" />
          <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            <option value="">— New / one-off customer —</option>
            {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.companyName}</option>)}
          </select>
        </span>
        <span className="ml-auto flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button type="button" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="rounded-md p-1 text-slate-500 hover:bg-white"><ZoomOut size={13} /></button>
          <span className="w-9 text-center text-[10px] font-bold text-slate-500">{Math.round(scale * 100)}%</span>
          <button type="button" title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} className="rounded-md p-1 text-slate-500 hover:bg-white"><ZoomIn size={13} /></button>
        </span>
        {canEdit && <>
          <Button size="sm" icon={<CheckCircle2 size={13} />} loading={saving} onClick={() => save(true)}>Generate Invoice</Button>
          <Button size="sm" variant="outline" icon={<Save size={13} />} loading={saving} onClick={() => save(false)}>Save Draft</Button>
        </>}
        <Button size="sm" variant="outline" icon={<Printer size={13} />} loading={printing} onClick={printDoc}>Print / PDF</Button>
        <Button size="sm" variant="outline" icon={<Mail size={13} />} loading={emailing} onClick={emailDoc}>Email</Button>
        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onDone}>Cancel</Button>
      </div>

      {/* The invoice — scaled to fit, never clipped; horizontal scroll only if
          the user zooms beyond the available width. */}
      {/* Which template this invoice is being produced with — loaded from the
          Template Gallery default, never hardcoded here. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
        <FileText size={12} className="text-brand-500" />
        <span className="text-[11px] text-slate-500">Template</span>
        <span className="text-[11px] font-bold text-slate-700">{templateName}</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">Default</span>
        <span className="text-[10px] text-slate-400">— change it in Templates &amp; Branding → Template Gallery.</span>
      </div>

      <div className="w-full overflow-x-auto rounded-xl bg-slate-100/70 p-3">
        <div style={{ width: A4_W * scale, height: docH * scale, margin: '0 auto' }}>
          <div ref={docRef} style={{ width: A4_W, transform: `scale(${scale})`, transformOrigin: 'top left', boxShadow: '0 1px 12px rgba(15,23,42,.12)' }}>
            {activeLayout
              // A DESIGNED template is the default: show the real document it will
              // print, rendered by the shared renderer. Field editing stays on the
              // built-in view (a canvas design has no inline-editable fields), so
              // the values are entered there and printed through this template.
              ? <iframe title="Invoice preview" srcDoc={renderWithDefaultTemplate(false)}
                  style={{ width: A4_W, height: docH, border: 0, background: '#fff' }} />
              : <ServiceInvoiceDocument doc={doc} onChange={patch} company={issuerCompany} settings={settings}
                  intraState={intraState} readOnly={!canEdit} override={override} onOverrideChange={setOverride}
                  customers={customers} products={products}
                  onPickCustomer={canEdit ? pickCustomer : undefined}
                  onPickProduct={canEdit ? applyProduct : undefined}
                  onCreateCustomer={canEdit ? () => setCustomerModal({ companyName: '', country: 'India', isActive: true }) : undefined}
                  onCreateProduct={canEdit ? (i: number) => { setProductRow(i); setProductModal({ name: '', unit: 'Nos', rate: 0, taxRate: 18, isActive: true }); } : undefined} />}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-400">
        {activeLayout
          ? <>Rendered with your default template <b className="text-slate-600">{templateName}</b> · grand total <b className="text-slate-600">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b> · this is exactly what prints.</>
          : <>Click any value to edit it directly on the invoice · totals, GST and amount in words update automatically ·
            grand total <b className="text-slate-600">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b> ·
            this is exactly what prints.</>}
      </p>
      {/* Create Customer / Product without leaving the invoice — the SAME forms
          the Customers and Products & Services tabs use (MasterModals). */}
      {customerModal && <CustomerModal customer={customerModal} onClose={() => setCustomerModal(null)} onSave={saveNewCustomer} />}
      {productModal && <ProductModal product={productModal} onClose={() => { setProductModal(null); setProductRow(null); }} onSave={saveNewProduct} />}
    </div>
  );
};

export default ServiceInvoiceEditor;
