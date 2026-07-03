// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDesigner — the "Zoho-style" template designer for the Invoice module.
// Left: accordion of configuration sections (template gallery, colours, type,
// header/customer/columns/totals/footer). Right: a STICKY live preview rendered
// by the SAME invoiceDocHtml the real print/PDF uses, so what you design is
// exactly what generates. Persists per-company to invoice_settings.designJson.
//
// Non-destructive: branding assets (logo/seal/signature/watermark/letterhead)
// stay owned by Company Profile → Branding & Assets (BrandingService); the
// designer only controls layout/colour/typography/section visibility.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { resolveBranding } from '@/services/brandingService';
import {
  invoiceDocHtml, resolveDesign, TEMPLATE_PRESETS, SAMPLE_INVOICE,
  type InvoiceDesign, type InvoiceColumn,
} from './invoiceTemplate';
import {
  Palette, Type, LayoutGrid, Table2, Sigma, PanelTop, User, AlignLeft, ChevronDown,
  Save, RotateCcw, Printer, CheckCircle2, XCircle, ArrowUp, ArrowDown, Loader2, Eye,
} from 'lucide-react';

const FONTS = [
  { label: 'Segoe UI (default)', value: "'Segoe UI', Arial, sans-serif" },
  { label: 'Inter', value: "'Inter', 'Segoe UI', sans-serif" },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier (mono)', value: "'Courier New', monospace" },
];

// A collapsible section (accordion) — enterprise feel, keeps the panel tidy.
const Section: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }> =
  ({ icon: Icon, title, subtitle, defaultOpen, children }) => {
    const [open, setOpen] = useState(!!defaultOpen);
    return (
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3.5 py-3 hover:bg-slate-50 transition-colors">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Icon size={15} /></div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-800">{title}</p>
            {subtitle && <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>}
          </div>
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100">{children}</div>}
      </div>
    );
  };

const Toggle: React.FC<{ label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <label className={`flex items-center gap-2 py-1 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <input type="checkbox" className="accent-blue-600 h-3.5 w-3.5" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="text-xs text-slate-700">{label}</span>
  </label>
);

const ColorRow: React.FC<{ label: string; value: string; disabled?: boolean; onChange: (v: string) => void }> = ({ label, value, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-xs text-slate-600">{label}</span>
    <div className="flex items-center gap-1.5">
      <input type="color" value={value || '#000000'} disabled={disabled} onChange={e => onChange(e.target.value)} className="h-6 w-8 rounded border border-slate-200 bg-white p-0 disabled:opacity-50" />
      <input type="text" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="w-20 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-mono disabled:bg-slate-50" />
    </div>
  </div>
);

const COLUMN_LABELS: Record<string, string> = { sr: '#', item: 'Item', hsn: 'HSN/SAC', qty: 'Qty', rate: 'Rate', disc: 'Discount', gst: 'GST %', amount: 'Amount' };

export const InvoiceDesigner: React.FC<{ company: any; canManage: boolean }> = ({ company, canManage }) => {
  const [settings, setSettings] = useState<any>(null);
  const [design, setDesign] = useState<InvoiceDesign>(() => resolveDesign(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { const s = await api.invoicing.getSettings(); setSettings(s); setDesign(resolveDesign(s)); }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  // Live preview HTML — recomputed on every design/company change (no save needed).
  const previewHtml = useMemo(
    () => invoiceDocHtml(SAMPLE_INVOICE, company, design, { print: false }),
    [design, company],
  );

  const brand = useMemo(() => resolveBranding(company), [company]);

  // Nested-patch helpers.
  const patch = (p: Partial<InvoiceDesign>) => setDesign(d => ({ ...d, ...p }));
  const patchColors = (p: Partial<InvoiceDesign['colors']>) => setDesign(d => ({ ...d, colors: { ...d.colors, ...p } }));
  const patchFont = (p: Partial<InvoiceDesign['font']>) => setDesign(d => ({ ...d, font: { ...d.font, ...p } }));
  const patchTotals = (p: Partial<InvoiceDesign['totals']>) => setDesign(d => ({ ...d, totals: { ...d.totals, ...p } }));
  const patchHeader = (p: Partial<InvoiceDesign['header']>) => setDesign(d => ({ ...d, header: { ...d.header, ...p } }));
  const patchCustomer = (p: Partial<InvoiceDesign['customer']>) => setDesign(d => ({ ...d, customer: { ...d.customer, ...p } }));
  const patchFooter = (p: Partial<InvoiceDesign['footer']>) => setDesign(d => ({ ...d, footer: { ...d.footer, ...p } }));

  const applyPreset = (presetId: string) => {
    const preset = TEMPLATE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setDesign(d => resolveDesign({ ...d, ...preset.apply, paper: preset.paper, orientation: preset.orientation }));
  };

  const setColumn = (key: string, changes: Partial<InvoiceColumn>) =>
    setDesign(d => ({ ...d, columns: d.columns.map(c => (c.key === key ? { ...c, ...changes } : c)) }));
  const moveColumn = (idx: number, dir: -1 | 1) => setDesign(d => {
    const cols = [...d.columns];
    const j = idx + dir;
    if (j < 0 || j >= cols.length) return d;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    return { ...d, columns: cols };
  });

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const s = await api.invoicing.saveSettings({ ...(settings || {}), designJson: JSON.stringify(design) });
      setSettings(s);
      ui.toast.success('Invoice template saved. New invoices will use this design.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!(await ui.confirm({ message: 'Reset the invoice design to the Standard template? Unsaved changes are lost.', confirmText: 'Reset' }))) return;
    setDesign(resolveDesign(null));
  };

  const generateSample = () => {
    const html = invoiceDocHtml(SAMPLE_INVOICE, company, design, { print: true });
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { ui.toast.error('Allow pop-ups to open the sample invoice.'); return; }
    w.document.write(html); w.document.close();
  };

  if (loading) return <Card><div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={16} className="animate-spin" /> Loading designer…</div></Card>;

  const assetChip = (label: string, present: boolean) => (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${present ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
      {present ? <CheckCircle2 size={10} /> : <XCircle size={10} />}{label}
    </span>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4">
      {/* ── Left: configuration ── */}
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5">
          <Button size="sm" icon={saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} loading={saving} disabled={!canManage} onClick={save}>Save</Button>
          <Button size="sm" variant="outline" icon={<RotateCcw size={13} />} onClick={reset} disabled={!canManage}>Reset</Button>
          <Button size="sm" variant="outline" icon={<Printer size={13} />} onClick={generateSample}>Generate Sample</Button>
          {!canManage && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ml-auto">View Only</span>}
        </div>

        {/* Template gallery */}
        <Section icon={LayoutGrid} title="Template Gallery" subtitle="Pick a base layout" defaultOpen>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {TEMPLATE_PRESETS.map(p => (
              <button key={p.id} disabled={!canManage} onClick={() => applyPreset(p.id)}
                className={`text-left rounded-lg border p-2 transition-all ${design.template === p.id ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-60`}>
                <div className="h-8 rounded mb-1.5 flex items-end gap-0.5 p-1" style={{ background: `${p.swatch}14` }}>
                  <div className="h-1.5 flex-1 rounded-sm" style={{ background: p.swatch }} />
                  <div className="h-3 w-2 rounded-sm" style={{ background: p.swatch, opacity: 0.5 }} />
                </div>
                <p className="text-[11px] font-bold text-slate-700">{p.name}</p>
                <p className="text-[9px] text-slate-400">{p.paper} · {p.orientation}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* Branding (owned by Company Profile) */}
        <Section icon={Palette} title="Organization Branding" subtitle="From Company Profile → Branding & Assets">
          <div className="flex flex-wrap gap-1.5 mt-2">
            {assetChip('Logo', brand.hasLogo)}
            {assetChip('Signature', brand.hasSignature)}
            {assetChip('Seal', brand.hasSeal)}
            {assetChip('Watermark', brand.hasWatermark)}
            {assetChip('Letterhead', brand.hasLetterhead)}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 leading-snug">Branding assets are managed once in <b>Company Profile → Branding & Assets</b> and flow into every invoice automatically. Upload there to change them.</p>
        </Section>

        {/* Colours */}
        <Section icon={Palette} title="Colours" subtitle="Primary, table & totals">
          <div className="mt-1">
            <ColorRow label="Primary (accent)" value={design.colors.primary || (company?.themeColor || '#4F7CFF')} disabled={!canManage} onChange={v => patchColors({ primary: v })} />
            <ColorRow label="Table header bg" value={design.colors.tableHeaderBg} disabled={!canManage} onChange={v => patchColors({ tableHeaderBg: v })} />
            <ColorRow label="Table header text" value={design.colors.tableHeaderText} disabled={!canManage} onChange={v => patchColors({ tableHeaderText: v })} />
            <ColorRow label="Body text" value={design.colors.text} disabled={!canManage} onChange={v => patchColors({ text: v })} />
            <ColorRow label="Border" value={design.colors.border} disabled={!canManage} onChange={v => patchColors({ border: v })} />
            <ColorRow label="Grand total" value={design.colors.grandTotal} disabled={!canManage} onChange={v => patchColors({ grandTotal: v })} />
            <ColorRow label="Footer text" value={design.colors.footer} disabled={!canManage} onChange={v => patchColors({ footer: v })} />
          </div>
        </Section>

        {/* Typography */}
        <Section icon={Type} title="Typography" subtitle="Font, size, spacing">
          <div className="space-y-2 mt-1">
            <label className="block"><span className="text-[10px] font-bold text-slate-500">Body font</span>
              <select value={design.font.family} disabled={!canManage} onChange={e => patchFont({ family: e.target.value })} className="w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50">
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-[10px] font-bold text-slate-500">Heading font</span>
              <select value={design.font.heading} disabled={!canManage} onChange={e => patchFont({ heading: e.target.value })} className="w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50">
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[10px] font-bold text-slate-500">Font size (px)</span>
                <input type="number" min={8} max={18} value={design.font.size} disabled={!canManage} onChange={e => patchFont({ size: Number(e.target.value) })} className="w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50" /></label>
              <label className="block"><span className="text-[10px] font-bold text-slate-500">Line height</span>
                <input type="number" step={0.1} min={1} max={2.5} value={design.font.lineHeight} disabled={!canManage} onChange={e => patchFont({ lineHeight: Number(e.target.value) })} className="w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50" /></label>
            </div>
            <Toggle label="Table cell borders" checked={design.tableBorders} disabled={!canManage} onChange={v => patch({ tableBorders: v })} />
          </div>
        </Section>

        {/* Header */}
        <Section icon={PanelTop} title="Header" subtitle="Title & company details">
          <label className="block mt-1"><span className="text-[10px] font-bold text-slate-500">Document title</span>
            <input value={design.title} disabled={!canManage} onChange={e => patch({ title: e.target.value })} className="w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50" /></label>
          <div className="mt-1">
            <Toggle label="Show logo" checked={design.header.showLogo} disabled={!canManage} onChange={v => patchHeader({ showLogo: v })} />
            <Toggle label="Show company address" checked={design.header.showAddress} disabled={!canManage} onChange={v => patchHeader({ showAddress: v })} />
            <Toggle label="Show GSTIN" checked={design.header.showGstin} disabled={!canManage} onChange={v => patchHeader({ showGstin: v })} />
          </div>
        </Section>

        {/* Customer */}
        <Section icon={User} title="Customer Section" subtitle="Bill-to & payment fields">
          <div className="mt-1">
            <Toggle label="Show Bill-To block" checked={design.customer.showBillTo} disabled={!canManage} onChange={v => patchCustomer({ showBillTo: v })} />
            <Toggle label="Show customer GSTIN" checked={design.customer.showGstin} disabled={!canManage} onChange={v => patchCustomer({ showGstin: v })} />
            <Toggle label="Show email & phone" checked={design.customer.showEmailPhone} disabled={!canManage} onChange={v => patchCustomer({ showEmailPhone: v })} />
            <Toggle label="Show Payment block" checked={design.customer.showPayment} disabled={!canManage} onChange={v => patchCustomer({ showPayment: v })} />
          </div>
        </Section>

        {/* Item columns */}
        <Section icon={Table2} title="Item Table Columns" subtitle="Reorder & show / hide">
          <div className="mt-1 space-y-1">
            {design.columns.map((c, i) => (
              <div key={c.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                <input type="checkbox" className="accent-blue-600 h-3.5 w-3.5" checked={c.visible} disabled={!canManage} onChange={e => setColumn(c.key, { visible: e.target.checked })} />
                <span className="text-xs text-slate-700 flex-1">{COLUMN_LABELS[c.key] || c.label}</span>
                <button disabled={!canManage || i === 0} onClick={() => moveColumn(i, -1)} className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowUp size={12} /></button>
                <button disabled={!canManage || i === design.columns.length - 1} onClick={() => moveColumn(i, 1)} className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowDown size={12} /></button>
              </div>
            ))}
          </div>
        </Section>

        {/* Totals */}
        <Section icon={Sigma} title="Totals Section" subtitle="Rows to display">
          <div className="mt-1">
            <Toggle label="Subtotal" checked={design.totals.subtotal} disabled={!canManage} onChange={v => patchTotals({ subtotal: v })} />
            <Toggle label="Discount" checked={design.totals.discount} disabled={!canManage} onChange={v => patchTotals({ discount: v })} />
            <Toggle label="Taxable amount" checked={design.totals.taxable} disabled={!canManage} onChange={v => patchTotals({ taxable: v })} />
            <Toggle label="GST (CGST/SGST/IGST)" checked={design.totals.tax} disabled={!canManage} onChange={v => patchTotals({ tax: v })} />
            <Toggle label="Round off" checked={design.totals.roundOff} disabled={!canManage} onChange={v => patchTotals({ roundOff: v })} />
            <Toggle label="Grand total" checked={design.totals.grandTotal} disabled={!canManage} onChange={v => patchTotals({ grandTotal: v })} />
            <Toggle label="Amount in words" checked={design.totals.amountInWords} disabled={!canManage} onChange={v => patchTotals({ amountInWords: v })} />
          </div>
        </Section>

        {/* Footer */}
        <Section icon={AlignLeft} title="Footer" subtitle="Bank, notes, terms, signature">
          <div className="mt-1">
            <Toggle label="Bank details" checked={design.footer.showBank} disabled={!canManage} onChange={v => patchFooter({ showBank: v })} />
            <Toggle label="Notes" checked={design.footer.showNotes} disabled={!canManage} onChange={v => patchFooter({ showNotes: v })} />
            <Toggle label="Terms & conditions" checked={design.footer.showTerms} disabled={!canManage} onChange={v => patchFooter({ showTerms: v })} />
            <Toggle label="Signature & seal" checked={design.footer.showSignature} disabled={!canManage} onChange={v => patchFooter({ showSignature: v })} />
            <Toggle label="Footer text line" checked={design.footer.showFooterText} disabled={!canManage} onChange={v => patchFooter({ showFooterText: v })} />
          </div>
        </Section>
      </div>

      {/* ── Right: sticky live preview ── */}
      <div>
        <div className="lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Eye size={13} className="text-blue-500" /> Live Preview <span className="text-[10px] font-normal text-slate-400">· sample data · updates instantly</span></p>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{design.paper} · {design.orientation}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 shadow-inner">
            <iframe title="Invoice preview" srcDoc={previewHtml} className="w-full bg-white rounded-lg shadow-sm border border-slate-200" style={{ height: '78vh' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDesigner;
