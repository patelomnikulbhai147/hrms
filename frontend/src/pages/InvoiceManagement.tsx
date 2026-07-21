// ─────────────────────────────────────────────────────────────────────────────
// Invoice Management — isolated enterprise billing module (/api/invoicing).
//
// Tabs: Dashboard · Create Invoice · All Invoices · Customers · Products &
// Services · Payments · Settings. GST (CGST/SGST/IGST), discounts and round-off
// are computed live for preview and re-verified server-side on every save. A4
// print/PDF via a faithful print window. Fully DB-backed; zero impact on HR.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { invoiceDocHtml, resolveDesign, TEMPLATE_PRESETS, type InvoiceDesign } from '@/components/invoicing/invoiceTemplate';
import { InvoiceDesigner } from '@/components/invoicing/InvoiceDesigner';
import { resolveLayout, type InvoiceLayout } from '@/components/invoicing/invoiceCanvas';
import { resolveIssuer, parseBank, serialiseBank, BANK_FIELDS } from '@/components/invoicing/serviceInvoice';
import { ASSET_RULES, acceptAttr, allowedLabel, prepareAsset, type AssetKey } from '@/components/invoicing/invoiceAssets';
import { ServiceInvoiceEditor } from '@/components/invoicing/ServiceInvoiceEditor';
import { useIssuerCompany } from '@/components/invoicing/invoiceIdentity';
// One definition of each master form, shared with the Create-Invoice pickers.
import { CustomerModal, ProductModal } from '@/components/invoicing/MasterModals';

// The renderer decision now lives in invoiceRender.ts so the Template Gallery
// preview, the Create-Invoice preview and the print/PDF path are provably ONE
// code path — a gallery preview cannot drift from what actually prints.
import { renderInvoiceHtml, printInvoiceDocument } from '@/components/invoicing/invoiceRender';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { DevelopmentBanner } from '@/components/ui/DevelopmentBanner';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import type { Role } from '@/data/mockData';
import {
  LayoutDashboard, FilePlus2, ReceiptText, Users, Package, Wallet, Settings as SettingsIcon,
  Plus, Trash2, Search, Eye, Edit, Copy, Printer, IndianRupee, X, Save, RefreshCw, Ban,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, FileText, Send, Palette, Maximize2,
  ZoomIn, ZoomOut, Download,
} from 'lucide-react';

interface Props { role: Role; activeCompanyId?: string; companies?: any[]; }

// ── Money helpers ─────────────────────────────────────────────────────────────
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Client mirror of services/invoiceCalc (preview only — server is authoritative).
function computeInvoice(items: any[], intraState: boolean) {
  const lines = (items || []).map((it) => {
    const gross = r2((Number(it.quantity) || 0) * (Number(it.rate) || 0));
    const discountAmt = it.discountAmt ? r2(it.discountAmt) : r2(gross * (Number(it.discountPct) || 0) / 100);
    const taxable = r2(gross - Math.min(discountAmt, gross));
    const tax = r2(taxable * (Number(it.taxRate) || 0) / 100);
    const cgst = intraState ? r2(tax / 2) : 0;
    const sgst = intraState ? r2(tax - cgst) : 0;
    const igst = intraState ? 0 : tax;
    return { ...it, gross, discountAmt, taxable, cgst, sgst, igst, amount: r2(taxable + tax) };
  });
  const sum = (k: string) => r2(lines.reduce((s, l: any) => s + (l[k] || 0), 0));
  const taxableAmount = sum('taxable');
  const cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
  const preRound = r2(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(preRound);
  return { lines, subtotal: sum('gross'), discountTotal: sum('discountAmt'), taxableAmount, cgst, sgst, igst, roundOff: r2(grandTotal - preRound), grandTotal };
}

// A4 / Letter pixel dimensions (~96dpi) for the scaled Create-Invoice preview.
const PREVIEW_PAGE_PX: Record<string, Record<string, [number, number]>> = {
  A4: { portrait: [794, 1123], landscape: [1123, 794] },
  Letter: { portrait: [816, 1056], landscape: [1056, 816] },
};
const presetName = (id?: string) => TEMPLATE_PRESETS.find((p) => p.id === id)?.name || 'Standard';
// Apply a gallery preset over a base design — mirrors InvoiceDesigner.applyPreset,
// but returns a fresh design instead of mutating the company default. Used to
// preview a per-invoice template choice without ever touching saved settings.
const buildDesignForTemplate = (base: InvoiceDesign, templateId: string): InvoiceDesign => {
  const preset = TEMPLATE_PRESETS.find((p) => p.id === templateId);
  if (!preset) return base;
  return resolveDesign({ ...base, ...preset.apply, paper: preset.paper, orientation: preset.orientation });
};

const STATUS_TONE: Record<string, string> = {
  Draft: 'gray', Generated: 'blue', Sent: 'blue', Viewed: 'blue',
  'Partially Paid': 'amber', Paid: 'green', Closed: 'green', Cancelled: 'red',
};
const statusBadge = (s: string) => <Badge variant={(STATUS_TONE[s] || 'gray') as any}>{s}</Badge>;

// Daily OPERATIONS — the tabs Accounts/HR use every day to bill customers.
const OPERATION_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'create', label: 'Create Invoice', icon: FilePlus2 },
  { id: 'invoices', label: 'All Invoices', icon: ReceiptText },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'products', label: 'Products & Services', icon: Package },
  { id: 'payments', label: 'Payments', icon: Wallet },
] as const;
// One-time company CONFIGURATION — an administrative setup area, opened once by
// the Company Head / authorized admin, never part of the daily billing workflow.
// "Invoice Designer" is renamed "Templates & Branding"; its tab id stays
// `designer` so the existing render switch and saved design payload are untouched.
const ADMIN_TABS = [
  { id: 'designer', label: 'Templates & Branding', icon: Palette },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;
const TABS = [...OPERATION_TABS, ...ADMIN_TABS] as const;
type TabId = typeof TABS[number]['id'];

export const InvoiceManagement: React.FC<Props> = ({ role, activeCompanyId, companies = [] }) => {
  const canEdit = ['Company Head', 'Finance', 'HR'].includes(role);
  const canManage = ['Company Head', 'Finance', 'Super Admin'].includes(role);
  // Templates & Branding is a one-time company configuration, not a daily task.
  // Only the Company Head / authorized admin may open it — Accounts (Finance) and
  // HR create invoices but do NOT change company branding. Everyday invoicing is
  // unaffected: generated invoices always pick up the saved template automatically.
  const canBranding = ['Company Head', 'Super Admin'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null); // when creating from an existing draft
  const propCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));
  // COMPANY PROFILE IS THE BRANDING SOURCE, and the LEGAL ENTITY is always the
  // parent company — a branch workspace bills under its parent and appears only
  // as `branchLabel`. useIssuerCompany re-reads the profile on every workspace
  // switch (so a logo/GST/bank edit is live on the next invoice) and resolves
  // both kinds of "branch" App merges into `companies`. See invoiceIdentity.ts.
  const activeCompany = useIssuerCompany(propCompany);
  const companyState: string = activeCompany?.state || '';

  const goCreate = (id: number | null = null) => { setEditInvoiceId(id); setTab('create'); };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-[#F7E3D3] bg-white px-4 py-3 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><ReceiptText size={16} className="text-[#C77E52]" /> Invoice Management</h2>
          <p className="text-[11px] text-slate-400">Generate GST invoices, track payments & outstanding, manage customers and billable items — {activeCompany?.name || 'your company'}.</p>
        </div>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => goCreate(null)}>New Invoice</Button>}
      </div>

      {/* Development-status banner — permanent & non-dismissible by design.
          Remove this <DevelopmentBanner /> from the JSX when the module ships. */}
      <DevelopmentBanner
        status="development"
        message="Invoice Management is under active development. Advanced invoice templates, branding, recurring invoices, payment gateway integrations, PDF enhancements, and automation are still being completed. Current invoice generation remains safe to use."
      />

      {/* Sub navigation — daily OPERATIONS on the left, a divider, then the
          one-time SETUP group (Templates & Branding + Settings) on the right so
          users immediately see that branding is administrative config, not a step
          in creating an invoice. The branding tab is hidden from users who cannot
          manage it (Accounts/HR) — they only ever create invoices. */}
      {(() => {
        const renderTab = (t: typeof TABS[number]) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== 'create') setEditInvoiceId(null); }}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs whitespace-nowrap -mb-px nav-tab ${tab === t.id ? 'nav-tab-active' : ''}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        };
        const adminTabs = ADMIN_TABS.filter((t) => t.id !== 'designer' || canBranding);
        return (
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
            {OPERATION_TABS.map(renderTab)}
            {adminTabs.length > 0 && (
              <>
                <span aria-hidden className="mx-2 hidden h-5 w-px self-center bg-slate-200 sm:block" />
                <span className="hidden select-none self-center pr-1 text-[9px] font-bold uppercase tracking-wider text-slate-300 sm:block">Setup</span>
                {adminTabs.map(renderTab)}
              </>
            )}
          </div>
        );
      })()}

      {tab === 'dashboard' && <DashboardTab onOpen={(id) => { setEditInvoiceId(id); setTab('invoices'); }} onNew={() => goCreate(null)} />}
      {tab === 'create' && <ServiceInvoiceEditor editId={editInvoiceId} canEdit={canEdit} companyState={companyState} company={activeCompany} onDone={() => { setEditInvoiceId(null); setTab('invoices'); }} />}
      {tab === 'invoices' && <InvoicesTab canEdit={canEdit} canManage={canManage} company={activeCompany} onEdit={(id) => goCreate(id)} focusId={editInvoiceId} />}
      {tab === 'customers' && <CustomersTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'products' && <ProductsTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'payments' && <PaymentsTab canEdit={canEdit} />}
      {tab === 'designer' && (canBranding
        ? <InvoiceDesigner company={activeCompany} canManage={canBranding} />
        : <Empty icon={<Palette size={26} />} title="Templates & Branding is restricted" sub="Only the Company Head or an authorized admin can configure invoice templates and branding." />)}
      {tab === 'settings' && <SettingsTab canManage={canManage} company={activeCompany} />}
    </div>
  );
};

// ── KPI card ──────────────────────────────────────────────────────────────────
const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-[#FCF4EE] text-[#C77E52]'}`}>{icon}</div>
    <p className="text-xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);

// ── Dashboard ─────────────────────────────────────────────────────────────────
const DashboardTab: React.FC<{ onOpen: (id: number) => void; onNew: () => void }> = ({ onOpen, onNew }) => {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setD(await api.invoicing.dashboard()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  const k = d?.kpis || {};
  const months = Object.entries(d?.monthly || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const maxM = Math.max(1, ...months.map(([, v]) => Number(v)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total Invoices" value={loading ? '—' : k.total ?? 0} icon={<ReceiptText size={16} />} />
        <Kpi label="Total Revenue" value={loading ? '—' : inr(k.totalRevenue)} icon={<TrendingUp size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Outstanding" value={loading ? '—' : inr(k.outstanding)} icon={<AlertTriangle size={16} />} tone="bg-orange-50 text-orange-600" />
        <Kpi label="This Month" value={loading ? '—' : inr(k.thisMonthRevenue)} icon={<IndianRupee size={16} />} tone="bg-brand-50 text-brand-600" />
        <Kpi label="Overdue" value={loading ? '—' : k.overdue ?? 0} icon={<Clock size={16} />} tone="bg-rose-50 text-rose-600" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Draft" value={loading ? '—' : k.draft ?? 0} icon={<FileText size={16} />} tone="bg-slate-100 text-slate-500" />
        <Kpi label="Generated" value={loading ? '—' : k.generated ?? 0} icon={<FileText size={16} />} tone="bg-brand-50 text-brand-600" />
        <Kpi label="Sent" value={loading ? '—' : k.sent ?? 0} icon={<Send size={16} />} tone="bg-brand-50 text-brand-600" />
        <Kpi label="Partially Paid" value={loading ? '—' : k.partiallyPaid ?? 0} icon={<Clock size={16} />} tone="bg-amber-50 text-amber-600" />
        <Kpi label="Paid" value={loading ? '—' : k.paid ?? 0} icon={<CheckCircle2 size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Cancelled" value={loading ? '—' : k.cancelled ?? 0} icon={<Ban size={16} />} tone="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly revenue bar chart */}
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Monthly Revenue (last 6 mo)</h3>
          {months.length === 0 ? <p className="text-xs text-slate-400 py-8 text-center">No payments recorded yet.</p> : (
            <div className="flex items-end gap-3 h-40">
              {months.map(([m, v]) => (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-[#C77E52]/80" style={{ height: `${Math.max(4, (Number(v) / maxM) * 130)}px` }} title={inr(v)} />
                  <span className="text-[9px] text-slate-400">{m.slice(5)}/{m.slice(2, 4)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        {/* Recent + upcoming */}
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Recent Invoices</h3>
          <div className="space-y-1">
            {(d?.recent || []).slice(0, 5).map((i: any) => (
              <button key={i.id} onClick={() => onOpen(i.id)} className="w-full flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <span className="font-semibold text-slate-700 truncate">{i.invoiceNumber} · {i.billToName}</span>
                <span className="flex items-center gap-2 shrink-0">{inr(i.grandTotal)} {statusBadge(i.status)}</span>
              </button>
            ))}
            {(d?.recent || []).length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No invoices yet. <button onClick={onNew} className="text-[#C77E52] font-bold">Create one</button>.</p>}
          </div>
          {(d?.upcoming || []).length > 0 && <>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mt-3 mb-2">Upcoming Due</h3>
            <div className="space-y-1">
              {d.upcoming.slice(0, 4).map((i: any) => (
                <div key={i.id} className="flex items-center justify-between text-xs py-1 px-2">
                  <span className="text-slate-600 truncate">{i.invoiceNumber} · {i.billToName}</span>
                  <span className="text-orange-600 font-semibold shrink-0">{inr(i.balanceDue)} · due {i.dueDate ? formatDate(i.dueDate) : '—'}</span>
                </div>
              ))}
            </div>
          </>}
        </Card>
      </div>
    </div>
  );
};

// ── Empty-state helper ────────────────────────────────────────────────────────
const Empty: React.FC<{ icon: React.ReactNode; title: string; sub?: string }> = ({ icon, title, sub }) => (
  <div className="py-14 text-center text-slate-400"><div className="mx-auto mb-2 w-fit">{icon}</div><p className="text-sm font-semibold text-slate-500">{title}</p>{sub && <p className="text-xs mt-1">{sub}</p>}</div>
);

// ══════════════════════════════════════════════════════════════════════════════
// INVOICE EDITOR (Create / Edit)
//
// The form-based editor was REPLACED by the WYSIWYG service-invoice document:
// the invoice itself is the editor (components/invoicing/ServiceInvoiceEditor).
// GST/rounding still come from services/invoiceCalc on the server.
// ══════════════════════════════════════════════════════════════════════════════
const todayIso = () => new Date().toISOString().slice(0, 10);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs py-1"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-700">{value}</span></div>
);

// ══════════════════════════════════════════════════════════════════════════════
// ALL INVOICES
// ══════════════════════════════════════════════════════════════════════════════
const InvoicesTab: React.FC<{ canEdit: boolean; canManage: boolean; company: any; onEdit: (id: number) => void; focusId: number | null }> = ({ canEdit, canManage, company, onEdit, focusId }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(''); const [status, setStatus] = useState('All');
  const [view, setView] = useState<any>(null); // invoice detail (with items/payments)
  const [payFor, setPayFor] = useState<any>(null); // record-payment target
  const [design, setDesign] = useState<InvoiceDesign>(() => resolveDesign(null));
  const [settings, setSettings] = useState<any>(null); // raw Template Settings (logo/GSTIN/bank/signature/footer)
  const [activeLayout, setActiveLayout] = useState<InvoiceLayout | null>(null);
  // Load the company's saved Invoice Designer template so print output matches it,
  // plus any ACTIVE canvas layout (which takes precedence when set).
  useEffect(() => { api.invoicing.getSettings().then((s: any) => { setSettings(s); setDesign(resolveDesign(s)); }).catch(() => {}); loadActiveLayout().then(setActiveLayout); }, []);
  // Keep the print layout in sync when the default template changes elsewhere.
  useEffect(() => {
    const onChanged = () => { loadActiveLayout().then(setActiveLayout); };
    window.addEventListener('hrms:invoice-templates-changed', onChanged);
    return () => window.removeEventListener('hrms:invoice-templates-changed', onChanged);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.invoicing.listInvoices({ q, status })); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); }
  }, [q, status]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { if (focusId) openView(focusId); }, [focusId]);

  const openView = async (id: number) => { try { setView(await api.invoicing.getInvoice(id)); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };

  const doAction = async (fn: () => Promise<any>, msg: string) => { try { await fn(); ui.toast.success(msg); await load(); } catch (e: any) { if (e?.code) ui.toast.error(e.message); else ui.toast.error(getApiErrorMessage(e)); } };
  const cancel = (i: any) => ui.confirm({ message: `Cancel invoice ${i.invoiceNumber}? It stays on record but is marked Cancelled.`, variant: 'danger', confirmText: 'Cancel Invoice' }).then((ok) => { if (ok) doAction(() => api.invoicing.setInvoiceStatus(i.id, 'Cancelled'), 'Invoice cancelled.'); });
  const remove = (i: any) => ui.confirm({ message: `Delete invoice ${i.invoiceNumber}? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' }).then(async (ok) => { if (!ok) return; try { await api.invoicing.deleteInvoice(i.id); ui.toast.success('Invoice deleted.'); await load(); } catch (e: any) { ui.toast.error(e?.message || getApiErrorMessage(e)); } });
  const duplicate = (i: any) => doAction(() => api.invoicing.duplicateInvoice(i.id), 'Invoice duplicated as a new draft.');
  // Every step is guarded: an unguarded `await getInvoice` used to reject into
  // nothing, so the click silently did nothing at all.
  const print = async (i: any) => {
    try {
      const full = i.items ? i : await api.invoicing.getInvoice(i.id);
      await printInvoice(full, company, design, activeLayout, settings);
      api.invoicing.logInvoiceAction(i.id, 'PRINTED').catch(() => {});
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not open the print view.')); }
  };
  // Email the invoice with the server-rendered PDF attached (additive endpoint).
  const emailInvoice = async (i: any) => {
    const to = String(i.billToEmail || '').trim();
    if (!to) { ui.toast.error(`${i.invoiceNumber} has no customer email. Add one on the invoice first.`); return; }
    try {
      const full = i.items ? i : await api.invoicing.getInvoice(i.id);
      // The attachment is rendered from the same template that prints.
      const html = renderInvoiceHtml(full, company, design, activeLayout, {}, settings);
      const res = await api.invoicing.emailInvoice(i.id, { to, html });
      if (res?.delivered) ui.toast.success(`Invoice ${i.invoiceNumber} emailed to ${to}.`);
      else ui.toast.info('SMTP is not configured — the email was logged on the server instead.');
      await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not send the invoice.')); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number / customer…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
          {['All', 'Draft', 'Generated', 'Sent', 'Partially Paid', 'Paid', 'Cancelled'].map((s) => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
        </select>
        <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={load} disabled={loading}>Refresh</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr><th className="p-3">Invoice No</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Due</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={9}><Empty icon={<ReceiptText size={26} />} title="No invoices yet" sub="Use “New Invoice” to create your first." /></td></tr>}
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50/60">
                  <td className="p-3 font-bold text-slate-800">{i.invoiceNumber}</td>
                  <td className="p-3 text-slate-600 truncate max-w-[160px]" title={i.billToName}>{i.billToName}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(i.invoiceDate)}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{i.dueDate ? formatDate(i.dueDate) : '—'}</td>
                  <td className="p-3 text-right font-semibold">{inr(i.grandTotal)}</td>
                  <td className="p-3 text-right text-emerald-600">{inr(i.amountPaid)}</td>
                  <td className="p-3 text-right text-orange-600 font-semibold">{inr(i.balanceDue)}</td>
                  <td className="p-3 text-center">{statusBadge(i.status)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconBtn title="View" onClick={() => openView(i.id)}><Eye size={14} /></IconBtn>
                      <IconBtn title="Print / PDF" onClick={() => print(i)}><Printer size={14} /></IconBtn>
                      <IconBtn title="Email to customer" tone="emerald" onClick={() => emailInvoice(i)}><Send size={14} /></IconBtn>
                      {canEdit && i.balanceDue > 0 && i.status !== 'Cancelled' && <IconBtn title="Record Payment" tone="emerald" onClick={() => setPayFor(i)}><IndianRupee size={14} /></IconBtn>}
                      {canEdit && !['Paid', 'Cancelled', 'Closed'].includes(i.status) && <IconBtn title="Edit" tone="indigo" onClick={() => onEdit(i.id)}><Edit size={14} /></IconBtn>}
                      {canEdit && <IconBtn title="Duplicate" tone="violet" onClick={() => duplicate(i)}><Copy size={14} /></IconBtn>}
                      {canManage && i.status !== 'Cancelled' && i.status !== 'Paid' && <IconBtn title="Cancel" tone="amber" onClick={() => cancel(i)}><Ban size={14} /></IconBtn>}
                      {canManage && ['Draft', 'Cancelled'].includes(i.status) && i.amountPaid === 0 && <IconBtn title="Delete" tone="rose" onClick={() => remove(i)}><Trash2 size={14} /></IconBtn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {view && <InvoiceDetailModal invoice={view} company={company} canEdit={canEdit} design={design} settings={settings} activeLayout={activeLayout} onEmail={() => emailInvoice(view)} onClose={() => setView(null)} onPay={() => { setPayFor(view); }} onChanged={load} />}
      {payFor && <RecordPaymentModal invoice={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); if (view) openView(view.id); }} />}
    </div>
  );
};

const IconBtn: React.FC<{ title: string; tone?: string; onClick: () => void; children: React.ReactNode }> = ({ title, tone, onClick, children }) => {
  const tones: Record<string, string> = { indigo: 'hover:text-brand-600 hover:bg-brand-50', violet: 'hover:text-brand-600 hover:bg-brand-50', emerald: 'hover:text-emerald-600 hover:bg-emerald-50', amber: 'hover:text-amber-600 hover:bg-amber-50', rose: 'hover:text-rose-600 hover:bg-rose-50' };
  return <button title={title} onClick={onClick} className={`p-1.5 rounded-lg text-slate-400 ${tones[tone || ''] || 'hover:text-brand-600 hover:bg-brand-50'}`}>{children}</button>;
};

// ── Invoice detail modal ──────────────────────────────────────────────────────
const InvoiceDetailModal: React.FC<{ invoice: any; company: any; canEdit: boolean; design?: InvoiceDesign; settings?: any; activeLayout?: InvoiceLayout | null; onEmail?: () => void; onClose: () => void; onPay: () => void; onChanged: () => void }> = ({ invoice, company, canEdit, design, settings, activeLayout, onEmail, onClose, onPay, onChanged }) => {
  const intra = invoice.cgst > 0;
  return (
    <Modal open onClose={onClose} title={`${invoice.invoiceNumber}`} size="lg"
      footer={<>
        <Button variant="outline" icon={<Printer size={14} />} onClick={() => {
          printInvoice(invoice, company, design, activeLayout, settings)
            .then(() => api.invoicing.logInvoiceAction(invoice.id, 'PRINTED').catch(() => {}))
            .catch((e) => ui.toast.error(getApiErrorMessage(e, 'Could not open the print view.')));
        }}>Print / PDF</Button>
        {onEmail && <Button variant="outline" icon={<Send size={14} />} onClick={onEmail}>Email</Button>}
        {canEdit && invoice.balanceDue > 0 && invoice.status !== 'Cancelled' && <Button icon={<IndianRupee size={14} />} onClick={onPay}>Record Payment</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div><p className="font-bold text-slate-800">{invoice.billToName}</p><p className="text-xs text-slate-400">{invoice.billToGstin || 'No GSTIN'} · {invoice.billToState || '—'}</p></div>
          <div className="text-right">{statusBadge(invoice.status)}<p className="text-xs text-slate-400 mt-1">{formatDate(invoice.invoiceDate)}{invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ''}</p></div>
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px]"><tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Tax%</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {(invoice.items || []).map((it: any) => (
                <tr key={it.id}><td className="p-2 font-medium text-slate-700">{it.name}</td><td className="p-2 text-right">{it.quantity} {it.unit}</td><td className="p-2 text-right">{inr(it.rate)}</td><td className="p-2 text-right">{it.taxRate}%</td><td className="p-2 text-right font-semibold">{inr(it.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <div className="w-64 space-y-1">
            <Row label="Taxable" value={inr(invoice.taxableAmount)} />
            {intra ? <><Row label="CGST" value={inr(invoice.cgst)} /><Row label="SGST" value={inr(invoice.sgst)} /></> : <Row label="IGST" value={inr(invoice.igst)} />}
            <Row label="Round Off" value={inr(invoice.roundOff)} />
            <div className="border-t border-slate-200 pt-1 flex justify-between text-sm font-extrabold"><span>Grand Total</span><span className="text-[#C77E52]">{inr(invoice.grandTotal)}</span></div>
            <Row label="Paid" value={inr(invoice.amountPaid)} />
            <div className="flex justify-between text-xs font-bold text-orange-600"><span>Balance Due</span><span>{inr(invoice.balanceDue)}</span></div>
          </div>
        </div>
        {(invoice.payments || []).length > 0 && <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Payments</p>
          <div className="space-y-1">{invoice.payments.map((p: any) => <div key={p.id} className="flex justify-between text-xs text-slate-600"><span>{formatDate(p.paymentDate)} · {p.mode}{p.referenceNumber ? ` · ${p.referenceNumber}` : ''}</span><span className="font-semibold text-emerald-600">{inr(p.amount)}</span></div>)}</div>
        </div>}
        {(invoice.audits || []).length > 0 && <p className="text-[10px] text-slate-400">Last activity: {invoice.audits[0].action} by {invoice.audits[0].performedBy || '—'} · {formatDateTime(invoice.audits[0].createdAt)}</p>}
      </div>
    </Modal>
  );
};

// ── Record payment modal ──────────────────────────────────────────────────────
const RecordPaymentModal: React.FC<{ invoice: any; onClose: () => void; onDone: () => void }> = ({ invoice, onClose, onDone }) => {
  const [amount, setAmount] = useState(String(invoice.balanceDue || ''));
  const [mode, setMode] = useState('Bank');
  const [ref, setRef] = useState(''); const [date, setDate] = useState(todayIso()); const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { ui.toast.error('Enter a valid amount.'); return; }
    if (amt > invoice.balanceDue + 0.01) { ui.toast.error(`Amount exceeds balance due (${inr(invoice.balanceDue)}).`); return; }
    setSaving(true);
    try { await api.invoicing.recordPayment(invoice.id, { amount: amt, mode, referenceNumber: ref, paymentDate: date, notes }); ui.toast.success('Payment recorded.'); onDone(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Record Payment — ${invoice.invoiceNumber}`} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} icon={<IndianRupee size={14} />}>Record</Button></>}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs flex justify-between"><span className="text-slate-500">Balance Due</span><span className="font-bold text-orange-600">{inr(invoice.balanceDue)}</span></div>
        <Input label="Amount *" type="number" value={amount} onChange={(e: any) => setAmount(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Mode" value={mode} onChange={(e: any) => setMode(e.target.value)} options={['Bank', 'Cash', 'UPI', 'Cheque', 'Card', 'Other'].map((m) => ({ value: m, label: m }))} />
          <Input label="Date" type="date" value={date} onChange={(e: any) => setDate(e.target.value)} />
        </div>
        <Input label="Reference Number" value={ref} onChange={(e: any) => setRef(e.target.value)} placeholder="UTR / cheque no." />
        <Input label="Notes" value={notes} onChange={(e: any) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════════════════════════════════════════
const CustomersTab: React.FC<{ canEdit: boolean; canManage: boolean }> = ({ canEdit, canManage }) => {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [q, setQ] = useState('');
  const [modal, setModal] = useState<any>(null);
  const load = useCallback(async () => { setLoading(true); try { setRows(await api.invoicing.listCustomers({ q })); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } }, [q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  const save = async (data: any) => { try { await api.invoicing.saveCustomer(data.id, data); ui.toast.success('Customer saved.'); setModal(null); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const del = (c: any) => ui.confirm({ message: `Delete customer "${c.companyName}"?`, variant: 'danger', confirmText: 'Delete' }).then(async (ok) => { if (!ok) return; try { await api.invoicing.deleteCustomer(c.id); ui.toast.success('Deleted.'); load(); } catch (e: any) { ui.toast.error(e?.message || getApiErrorMessage(e)); } });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setModal({ companyName: '', country: 'India', isActive: true })}>Add Customer</Button>}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs min-w-[760px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide"><tr><th className="p-3">Code</th><th className="p-3">Company</th><th className="p-3">GSTIN</th><th className="p-3">Contact</th><th className="p-3 text-center">Invoices</th><th className="p-3 text-right">Outstanding</th><th className="p-3 text-right">Paid</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9}><Empty icon={<Users size={26} />} title="No customers yet" /></td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="p-3 font-mono text-[11px] font-bold text-[#C77E52]">{c.customerCode || '—'}</td>
                <td className="p-3"><p className="font-bold text-slate-800">{c.companyName}</p><p className="text-[11px] text-slate-400">{c.email || c.phone || ''}</p></td>
                <td className="p-3 text-slate-600 font-mono text-[11px]">{c.gstin || '—'}</td>
                <td className="p-3 text-slate-600">{c.contactPerson || '—'}<span className="block text-[10px] text-slate-400">{[c.city, c.state].filter(Boolean).join(', ')}</span></td>
                <td className="p-3 text-center">{c.history?.count ?? 0}</td>
                <td className="p-3 text-right text-orange-600 font-semibold">{inr(c.history?.outstanding)}</td>
                <td className="p-3 text-right text-emerald-600">{inr(c.history?.paid)}</td>
                <td className="p-3 text-center">{c.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}</td>
                <td className="p-3"><div className="flex justify-end gap-0.5">{canEdit && <IconBtn title="Edit" tone="indigo" onClick={() => setModal(c)}><Edit size={14} /></IconBtn>}{canManage && <IconBtn title="Delete" tone="rose" onClick={() => del(c)}><Trash2 size={14} /></IconBtn>}</div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {modal && <CustomerModal customer={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
};
// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS & SERVICES
// ══════════════════════════════════════════════════════════════════════════════
const ProductsTab: React.FC<{ canEdit: boolean; canManage: boolean }> = ({ canEdit, canManage }) => {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [q, setQ] = useState('');
  const [modal, setModal] = useState<any>(null);
  const load = useCallback(async () => { setLoading(true); try { setRows(await api.invoicing.listProducts({ q })); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } }, [q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  const save = async (data: any) => { try { await api.invoicing.saveProduct(data.id, data); ui.toast.success('Product saved.'); setModal(null); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const del = (p: any) => ui.confirm({ message: `Delete "${p.name}"?`, variant: 'danger', confirmText: 'Delete' }).then(async (ok) => { if (!ok) return; try { await api.invoicing.deleteProduct(p.id); ui.toast.success('Deleted.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setModal({ name: '', unit: 'Nos', rate: 0, taxRate: 18, isActive: true })}>Add Product / Service</Button>}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs min-w-[640px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide"><tr><th className="p-3">Name</th><th className="p-3">HSN/SAC</th><th className="p-3">Unit</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">GST%</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7}><Empty icon={<Package size={26} />} title="No products / services yet" /></td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="p-3"><p className="font-bold text-slate-800">{p.name}</p>{p.description && <p className="text-[11px] text-slate-400 truncate max-w-[240px]">{p.description}</p>}</td>
                <td className="p-3 font-mono text-[11px] text-slate-600">{p.hsnSac || '—'}</td>
                <td className="p-3 text-slate-600">{p.unit}</td>
                <td className="p-3 text-right font-semibold">{inr(p.rate)}</td>
                <td className="p-3 text-right">{p.taxRate}%</td>
                <td className="p-3 text-center">{p.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}</td>
                <td className="p-3"><div className="flex justify-end gap-0.5">{canEdit && <IconBtn title="Edit" tone="indigo" onClick={() => setModal(p)}><Edit size={14} /></IconBtn>}{canManage && <IconBtn title="Delete" tone="rose" onClick={() => del(p)}><Trash2 size={14} /></IconBtn>}</div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {modal && <ProductModal product={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
};
// ══════════════════════════════════════════════════════════════════════════════
// PAYMENTS (all recorded payments across invoices)
// ══════════════════════════════════════════════════════════════════════════════
const PaymentsTab: React.FC<{ canEdit: boolean }> = () => {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const invoices = await api.invoicing.listInvoices({});
      const withPay = invoices.filter((i: any) => i.amountPaid > 0);
      const detailed = await Promise.all(withPay.slice(0, 200).map((i: any) => api.invoicing.getInvoice(i.id).catch(() => null)));
      const pays: any[] = [];
      for (const inv of detailed) { if (!inv) continue; for (const p of inv.payments || []) pays.push({ ...p, invoiceNumber: inv.invoiceNumber, customer: inv.billToName }); }
      pays.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
      setRows(pays);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); }
  })(); }, []);
  const total = rows.reduce((s, p) => s + (p.amount || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Payments Recorded" value={loading ? '—' : rows.length} icon={<Wallet size={16} />} />
        <Kpi label="Total Collected" value={loading ? '—' : inr(total)} icon={<TrendingUp size={16} />} tone="bg-emerald-50 text-emerald-600" />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs min-w-[680px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide"><tr><th className="p-3">Date</th><th className="p-3">Invoice</th><th className="p-3">Customer</th><th className="p-3">Mode</th><th className="p-3">Reference</th><th className="p-3 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6}><Empty icon={<Wallet size={26} />} title="No payments recorded yet" sub="Record a payment from All Invoices." /></td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                <td className="p-3 font-bold text-slate-700">{p.invoiceNumber}</td>
                <td className="p-3 text-slate-600 truncate max-w-[160px]">{p.customer}</td>
                <td className="p-3"><Badge variant="blue">{p.mode}</Badge></td>
                <td className="p-3 text-slate-500">{p.referenceNumber || '—'}</td>
                <td className="p-3 text-right font-semibold text-emerald-600">{inr(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
// One branding asset in the Invoice Branding panel. Validation, downscaling and
// the allowed formats all come from the shared invoiceAssets pipeline, so this
// panel and the on-invoice uploader behave identically.
const AssetField: React.FC<{ kind: AssetKey; value: string; fallback?: string; disabled?: boolean; onChange: (v: string) => void }> =
  ({ kind, value, fallback, disabled, onChange }) => {
    const rule = ASSET_RULES[kind];
    const [busy, setBusy] = useState(false);
    const shown = value || (fallback && /^data:image\//.test(String(fallback)) ? String(fallback) : '');
    const fromProfile = !value && !!shown;
    // Cleared in `finally` — a file-read error used to skip setBusy(false) and
    // leave this uploader disabled until the page was reloaded.
    const pick = async (file?: File | null) => {
      setBusy(true);
      try {
        const res = await prepareAsset(kind, file);
        if (!res.ok) { ui.toast.error(res.error); return; }
        onChange(res.dataUrl);
        ui.toast.success(`${rule.label} updated${res.note ? ` · ${res.note}` : ''}.`);
      } catch (e) {
        console.error('[invoice] asset upload failed', e);
        ui.toast.error('Could not read that file. Please try another image.');
      } finally { setBusy(false); }
    };
    return (
      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-500">{rule.label}</label>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
          <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
            {shown
              ? <img src={shown} alt="" className="max-h-full max-w-full object-contain" />
              : <span className="text-[10px] text-slate-400">None</span>}
          </div>
          <div className="min-w-0 flex-1">
            <input type="file" accept={acceptAttr(kind)} disabled={disabled || busy}
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
              className="block w-full text-[11px] file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[11px] file:font-bold" />
            <p className="mt-1 text-[10px] text-slate-400">
              {allowedLabel(kind)} · max {Math.round(rule.maxBytes / 1024 / 1024)} MB · auto-resized, aspect ratio kept
              {fromProfile && <span className="font-semibold text-emerald-600"> · using Company Profile</span>}
            </p>
          </div>
          {value && !disabled && (
            <button type="button" onClick={() => onChange('')} title="Clear (use Company Profile)"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={14} /></button>
          )}
        </div>
      </div>
    );
  };

const SettingsTab: React.FC<{ canManage: boolean; company?: any }> = ({ canManage, company }) => {
  const [f, setF] = useState<any>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => { try { setF(await api.invoicing.getSettings()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } })(); }, []);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const save = async () => { setSaving(true); try { const s = await api.invoicing.saveSettings(f); setF(s); ui.toast.success('Settings saved.'); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setSaving(false); } };
  if (!f) return <Empty icon={<SettingsIcon size={26} />} title="Loading settings…" />;
  // Bank block <-> discrete fields (kept in the existing bankDetails column).
  const bankFields = parseBank(f.bankDetails);
  const profileBank = parseBank(resolveIssuer(company, {}).bankDetails);
  const preview = String(f.numberFormat || '').replace('{PREFIX}', f.invoicePrefix || 'INV').replace('{FY}', '2026-27').replace('{YYYY}', '2026').replace('{MM}', '07').replace('{SEQ}', String(f.nextNumber || 1).padStart(f.seqPadding || 4, '0'));
  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Numbering</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Prefix" value={f.invoicePrefix} onChange={(e: any) => set('invoicePrefix', e.target.value)} disabled={!canManage} />
          <Input label="Number Format" value={f.numberFormat} onChange={(e: any) => set('numberFormat', e.target.value)} disabled={!canManage} />
          <Input label="Next Number" type="number" value={f.nextNumber} onChange={(e: any) => set('nextNumber', e.target.value)} disabled={!canManage} />
          <Input label="Seq Padding" type="number" value={f.seqPadding} onChange={(e: any) => set('seqPadding', e.target.value)} disabled={!canManage} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Tokens: <code>{'{PREFIX} {FY} {YYYY} {MM} {SEQ}'}</code> · Next invoice: <b className="text-[#C77E52]">{preview}</b></p>
      </Card>
      <Card>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Defaults</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Currency" value={f.defaultCurrency} onChange={(e: any) => set('defaultCurrency', e.target.value)} disabled={!canManage} />
          <Input label="Payment Terms" value={f.defaultPaymentTerms || ''} onChange={(e: any) => set('defaultPaymentTerms', e.target.value)} disabled={!canManage} />
          <Input label="Company GSTIN" value={f.companyGstin || ''} onChange={(e: any) => set('companyGstin', e.target.value)} disabled={!canManage} />
          <Input label="UPI ID" value={f.upiId || ''} onChange={(e: any) => set('upiId', e.target.value)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Bank Details</label><textarea value={f.bankDetails || ''} onChange={(e) => set('bankDetails', e.target.value)} rows={2} disabled={!canManage} className="w-full rounded-xl border border-slate-200 p-2 text-xs disabled:bg-slate-50" /></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Footer Text</label><textarea value={f.footerText || ''} onChange={(e) => set('footerText', e.target.value)} rows={2} disabled={!canManage} className="w-full rounded-xl border border-slate-200 p-2 text-xs disabled:bg-slate-50" /></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Default Notes</label><textarea value={f.defaultNotes || ''} onChange={(e) => set('defaultNotes', e.target.value)} rows={2} disabled={!canManage} className="w-full rounded-xl border border-slate-200 p-2 text-xs disabled:bg-slate-50" /></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Default Terms & Conditions</label><textarea value={f.defaultTerms || ''} onChange={(e) => set('defaultTerms', e.target.value)} rows={2} disabled={!canManage} className="w-full rounded-xl border border-slate-200 p-2 text-xs disabled:bg-slate-50" /></div>
        </div>
      </Card>
      {/* INVOICE BRANDING — the company-wide billing assets. Each one is an
          OVERRIDE: leave it empty and the invoice uses Company Profile, so
          nothing ever has to be uploaded twice. */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-lg bg-brand-50 p-1.5 text-brand-600"><Palette size={14} /></span>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Invoice Branding</h3>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">
          Applied to every newly generated invoice. Leave an asset empty to use the one from <b>Company Profile</b>.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AssetField kind="logo" value={f.logoUrl || ''} fallback={company?.logoImage} disabled={!canManage} onChange={(v) => set('logoUrl', v)} />
          <AssetField kind="signature" value={f.signatureUrl || ''} fallback={company?.digitalSignatureImage} disabled={!canManage} onChange={(v) => set('signatureUrl', v)} />
          <AssetField kind="stamp" value={f.stampUrl || ''} fallback={company?.stampImage} disabled={!canManage} onChange={(v) => set('stampUrl', v)} />
          <AssetField kind="qr" value={f.qrUrl || ''} disabled={!canManage} onChange={(v) => set('qrUrl', v)} />
        </div>

        <h4 className="mt-5 mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Bank Details</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BANK_FIELDS.map((label) => (
            <Input key={label} label={label} disabled={!canManage}
              value={bankFields[label] || ''}
              placeholder={profileBank[label] || 'From Company Profile'}
              onChange={(e: any) => set('bankDetails', serialiseBank({ ...bankFields, [label]: e.target.value }))} />
          ))}
          <Input label="UPI ID" value={f.upiId || ''} disabled={!canManage} placeholder="name@bank"
            onChange={(e: any) => set('upiId', e.target.value)} />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          PAN, GSTIN and CIN come from <b>Company Profile</b> so they stay a single source of truth across the system.
        </p>
      </Card>
      {canManage && <div className="flex justify-end"><Button loading={saving} onClick={save} icon={<Save size={14} />}>Save Settings</Button></div>}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// A4 PRINT / PDF — opens a print window with a faithful invoice layout
// ══════════════════════════════════════════════════════════════════════════════
function printInvoice(inv: any, company: any, design?: InvoiceDesign, activeLayout?: InvoiceLayout | null, settings?: any) {
  // Renders through the shared invoiceDocHtml so the print output is IDENTICAL to
  // the Invoice Designer's live preview. Branding still comes from BrandingService
  // inside the renderer. `design` defaults to the standard layout (unchanged output).
  // When the company has an ACTIVE canvas layout, render via the same renderer the
  // visual designer uses (preview === PDF). Opt-in only.
  //
  // Printed through a hidden iframe (printInvoiceDocument), NOT a popup: a
  // same-origin popup shares this tab's renderer process, so its modal print
  // loop froze the whole app — and orphaned it permanently if the popup went
  // away mid-dialog. See invoiceRender.printInvoiceDocument.
  const html = renderInvoiceHtml(inv, company, design, activeLayout, { print: true }, settings);
  return printInvoiceDocument(html);
}

// Fetch a company's ACTIVE canvas layout (or null → classic flow rendering).
async function loadActiveLayout(): Promise<InvoiceLayout | null> {
  try {
    const r = await api.invoicing.listLayouts();
    const active = (r?.layouts || []).find((l: any) => l.isDefault);
    return active ? resolveLayout(active.layout) : null;
  } catch { return null; }
}

// All of a company's saved canvas templates as raw rows ({ id, name, isDefault,
// layout }). Powers the Create-Invoice template gallery. Company isolation is
// enforced server-side (scopedWhere), so this only ever returns the caller's.
async function loadSavedLayoutRows(): Promise<any[]> {
  try {
    const r = await api.invoicing.listLayouts();
    return r?.layouts || [];
  } catch { return []; }
}

export default InvoiceManagement;
