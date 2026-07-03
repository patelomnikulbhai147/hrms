// ─────────────────────────────────────────────────────────────────────────────
// Invoice Management — isolated enterprise billing module (/api/invoicing).
//
// Tabs: Dashboard · Create Invoice · All Invoices · Customers · Products &
// Services · Payments · Settings. GST (CGST/SGST/IGST), discounts and round-off
// are computed live for preview and re-verified server-side on every save. A4
// print/PDF via a faithful print window. Fully DB-backed; zero impact on HR.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { invoiceDocHtml, resolveDesign, type InvoiceDesign } from '@/components/invoicing/invoiceTemplate';
import { InvoiceDesigner } from '@/components/invoicing/InvoiceDesigner';
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
  CheckCircle2, Clock, AlertTriangle, TrendingUp, FileText, Send, Palette,
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

const STATUS_TONE: Record<string, string> = {
  Draft: 'gray', Generated: 'blue', Sent: 'blue', Viewed: 'blue',
  'Partially Paid': 'amber', Paid: 'green', Closed: 'green', Cancelled: 'red',
};
const statusBadge = (s: string) => <Badge variant={(STATUS_TONE[s] || 'gray') as any}>{s}</Badge>;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'create', label: 'Create Invoice', icon: FilePlus2 },
  { id: 'invoices', label: 'All Invoices', icon: ReceiptText },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'products', label: 'Products & Services', icon: Package },
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'designer', label: 'Invoice Designer', icon: Palette },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;
type TabId = typeof TABS[number]['id'];

export const InvoiceManagement: React.FC<Props> = ({ role, activeCompanyId, companies = [] }) => {
  const canEdit = ['Company Head', 'Finance', 'HR'].includes(role);
  const canManage = ['Company Head', 'Finance', 'Super Admin'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null); // when creating from an existing draft
  const activeCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));
  const companyState: string = activeCompany?.state || '';

  const goCreate = (id: number | null = null) => { setEditInvoiceId(id); setTab('create'); };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-[#DBEAFE] bg-white px-4 py-3 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><ReceiptText size={16} className="text-[#4F7CFF]" /> Invoice Management</h2>
          <p className="text-[11px] text-slate-400">Generate GST invoices, track payments & outstanding, manage customers and billable items — {activeCompany?.name || 'your company'}.</p>
        </div>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => goCreate(null)}>New Invoice</Button>}
      </div>

      {/* Development-status banner — permanent & non-dismissible by design.
          Remove this <DevelopmentBanner /> from the JSX when the module ships. */}
      <DevelopmentBanner
        status="development"
        message="The Invoice Management module is currently under active development. Invoice templates, automation, tax configuration, PDF generation, payment integrations, and advanced billing features are still being implemented. Some functionality may be incomplete during development."
      />

      {/* Sub navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== 'create') setEditInvoiceId(null); }}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#4F7CFF] text-[#4F7CFF]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab onOpen={(id) => { setEditInvoiceId(id); setTab('invoices'); }} onNew={() => goCreate(null)} />}
      {tab === 'create' && <InvoiceEditor editId={editInvoiceId} canEdit={canEdit} companyState={companyState} company={activeCompany} onDone={() => { setEditInvoiceId(null); setTab('invoices'); }} />}
      {tab === 'invoices' && <InvoicesTab canEdit={canEdit} canManage={canManage} company={activeCompany} onEdit={(id) => goCreate(id)} focusId={editInvoiceId} />}
      {tab === 'customers' && <CustomersTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'products' && <ProductsTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'payments' && <PaymentsTab canEdit={canEdit} />}
      {tab === 'designer' && <InvoiceDesigner company={activeCompany} canManage={canEdit} />}
      {tab === 'settings' && <SettingsTab canManage={canManage} />}
    </div>
  );
};

// ── KPI card ──────────────────────────────────────────────────────────────────
const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-[#EDF4FF] text-[#4F7CFF]'}`}>{icon}</div>
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
        <Kpi label="This Month" value={loading ? '—' : inr(k.thisMonthRevenue)} icon={<IndianRupee size={16} />} tone="bg-indigo-50 text-indigo-600" />
        <Kpi label="Overdue" value={loading ? '—' : k.overdue ?? 0} icon={<Clock size={16} />} tone="bg-rose-50 text-rose-600" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Draft" value={loading ? '—' : k.draft ?? 0} icon={<FileText size={16} />} tone="bg-slate-100 text-slate-500" />
        <Kpi label="Generated" value={loading ? '—' : k.generated ?? 0} icon={<FileText size={16} />} tone="bg-blue-50 text-blue-600" />
        <Kpi label="Sent" value={loading ? '—' : k.sent ?? 0} icon={<Send size={16} />} tone="bg-sky-50 text-sky-600" />
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
                  <div className="w-full rounded-t bg-[#4F7CFF]/80" style={{ height: `${Math.max(4, (Number(v) / maxM) * 130)}px` }} title={inr(v)} />
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
            {(d?.recent || []).length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No invoices yet. <button onClick={onNew} className="text-[#4F7CFF] font-bold">Create one</button>.</p>}
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
// INVOICE EDITOR (Create / Edit) — full form with live GST totals
// ══════════════════════════════════════════════════════════════════════════════
const blankItem = () => ({ name: '', description: '', hsnSac: '', quantity: 1, unit: 'Nos', rate: 0, discountPct: 0, taxRate: 18 });
const todayIso = () => new Date().toISOString().slice(0, 10);

const InvoiceEditor: React.FC<{ editId: number | null; canEdit: boolean; companyState: string; company: any; onDone: () => void }> = ({ editId, canEdit, companyState, company, onDone }) => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    customerId: '', billToName: '', billToGstin: '', billToAddress: '', billToEmail: '', billToPhone: '', billToState: '',
    invoiceDate: todayIso(), dueDate: '', currency: 'INR', paymentTerms: 'Net 30', notes: '', termsConditions: '',
    paymentMode: '', bankDetails: '', upiId: '', items: [blankItem()],
  });

  useEffect(() => {
    (async () => {
      try {
        const [cs, ps, st] = await Promise.all([api.invoicing.listCustomers({ active: 'true' }), api.invoicing.listProducts({ active: 'true' }), api.invoicing.getSettings()]);
        setCustomers(Array.isArray(cs) ? cs : []); setProducts(Array.isArray(ps) ? ps : []); setSettings(st);
        setForm((f: any) => ({ ...f, paymentTerms: f.paymentTerms || st?.defaultPaymentTerms || 'Net 30', currency: st?.defaultCurrency || 'INR', notes: f.notes || st?.defaultNotes || '', termsConditions: f.termsConditions || st?.defaultTerms || '', bankDetails: f.bankDetails || st?.bankDetails || '', upiId: f.upiId || st?.upiId || '' }));
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    })();
  }, []);

  // Load an existing invoice when editing.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const inv = await api.invoicing.getInvoice(editId);
        setForm({
          customerId: inv.customerId ? String(inv.customerId) : '', billToName: inv.billToName || '', billToGstin: inv.billToGstin || '', billToAddress: inv.billToAddress || '',
          billToEmail: inv.billToEmail || '', billToPhone: inv.billToPhone || '', billToState: inv.billToState || '',
          invoiceDate: inv.invoiceDate || todayIso(), dueDate: inv.dueDate || '', currency: inv.currency || 'INR', paymentTerms: inv.paymentTerms || '',
          notes: inv.notes || '', termsConditions: inv.termsConditions || '', paymentMode: inv.paymentMode || '', bankDetails: inv.bankDetails || '', upiId: inv.upiId || '',
          items: (inv.items || []).map((it: any) => ({ name: it.name, description: it.description || '', hsnSac: it.hsnSac || '', quantity: it.quantity, unit: it.unit || 'Nos', rate: it.rate, discountPct: it.discountPct, taxRate: it.taxRate, productId: it.productId })),
          id: inv.id, invoiceNumber: inv.invoiceNumber,
        });
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    })();
  }, [editId]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setItem = (i: number, patch: any) => setForm((f: any) => ({ ...f, items: f.items.map((it: any, j: number) => j === i ? { ...it, ...patch } : it) }));
  const addItem = () => setForm((f: any) => ({ ...f, items: [...f.items, blankItem()] }));
  const removeItem = (i: number) => setForm((f: any) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_: any, j: number) => j !== i) : f.items }));

  const pickCustomer = (id: string) => {
    const c = customers.find((x) => String(x.id) === String(id));
    if (!c) { set('customerId', ''); return; }
    setForm((f: any) => ({ ...f, customerId: String(id), billToName: c.companyName, billToGstin: c.gstin || '', billToAddress: [c.addressLine, c.city, c.state].filter(Boolean).join(', '), billToEmail: c.email || '', billToPhone: c.phone || '', billToState: c.state || '' }));
  };
  const pickProduct = (i: number, id: string) => {
    const p = products.find((x) => String(x.id) === String(id));
    if (!p) return;
    setItem(i, { productId: p.id, name: p.name, description: p.description || '', hsnSac: p.hsnSac || '', unit: p.unit || 'Nos', rate: p.rate, taxRate: p.taxRate });
  };

  const intraState = !form.billToState || !companyState || String(form.billToState).trim().toLowerCase() === String(companyState).trim().toLowerCase();
  const totals = useMemo(() => computeInvoice(form.items, intraState), [form.items, intraState]);

  const save = async (finalize: boolean) => {
    if (!canEdit) return;
    if (!form.billToName.trim() && !form.customerId) { ui.toast.error('Select or enter a customer.'); return; }
    if (!form.items.some((it: any) => it.name.trim())) { ui.toast.error('Add at least one line item.'); return; }
    if (form.dueDate && form.dueDate < form.invoiceDate) { ui.toast.error('Due date cannot be before the invoice date.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, status: finalize ? 'Generated' : 'Draft', finalize };
      const saved = form.id ? await api.invoicing.updateInvoice(form.id, payload) : await api.invoicing.createInvoice(payload);
      ui.toast.success(`Invoice ${saved.invoiceNumber} ${form.id ? 'updated' : 'created'}${finalize ? ' & generated' : ' as draft'}.`);
      onDone();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not save the invoice.')); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-4">
      {/* Form */}
      <div className="space-y-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Customer</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select label="Select Customer" value={form.customerId} onChange={(e: any) => pickCustomer(e.target.value)}
              options={[{ value: '', label: '— New / one-off —' }, ...customers.map((c) => ({ value: String(c.id), label: c.companyName }))]} />
            <Input label="Customer / Company Name *" value={form.billToName} onChange={(e: any) => set('billToName', e.target.value)} />
            <Input label="GSTIN" value={form.billToGstin} onChange={(e: any) => set('billToGstin', e.target.value)} />
            <Input label="State (Place of Supply)" value={form.billToState} onChange={(e: any) => set('billToState', e.target.value)} placeholder="e.g. Gujarat" />
            <Input label="Email" value={form.billToEmail} onChange={(e: any) => set('billToEmail', e.target.value)} />
            <Input label="Mobile" value={form.billToPhone} onChange={(e: any) => set('billToPhone', e.target.value)} />
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-bold text-slate-500">Address</label>
              <textarea value={form.billToAddress} onChange={(e) => set('billToAddress', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Invoice Details</h3>
            {form.invoiceNumber && <span className="text-xs font-mono font-bold text-[#4F7CFF]">{form.invoiceNumber}</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="Invoice Date *" type="date" value={form.invoiceDate} onChange={(e: any) => set('invoiceDate', e.target.value)} />
            <Input label="Due Date" type="date" value={form.dueDate} onChange={(e: any) => set('dueDate', e.target.value)} />
            <Input label="Currency" value={form.currency} onChange={(e: any) => set('currency', e.target.value)} />
            <Input label="Payment Terms" value={form.paymentTerms} onChange={(e: any) => set('paymentTerms', e.target.value)} />
          </div>
        </Card>

        {/* Items */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Items</h3>
            <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={addItem}>Add Row</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="text-slate-400 uppercase text-[10px] tracking-wide border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-2 w-[26%]">Product / Service</th><th className="py-2 px-1">HSN/SAC</th>
                  <th className="py-2 px-1 text-right">Qty</th><th className="py-2 px-1">Unit</th>
                  <th className="py-2 px-1 text-right">Rate</th><th className="py-2 px-1 text-right">Disc%</th>
                  <th className="py-2 px-1 text-right">GST%</th><th className="py-2 px-1 text-right">Amount</th><th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {form.items.map((it: any, i: number) => {
                  const line: any = totals.lines[i] || {};
                  return (
                    <tr key={i} className="align-top">
                      <td className="py-1.5 pr-2">
                        {products.length > 0 && (
                          <select className="w-full mb-1 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-500" value={it.productId || ''} onChange={(e) => pickProduct(i, e.target.value)}>
                            <option value="">— pick a product —</option>
                            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                        <input className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs" placeholder="Item name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                      </td>
                      <td className="py-1.5 px-1"><input className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs" value={it.hsnSac} onChange={(e) => setItem(i, { hsnSac: e.target.value })} /></td>
                      <td className="py-1.5 px-1"><input type="number" className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs text-right" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></td>
                      <td className="py-1.5 px-1"><input className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                      <td className="py-1.5 px-1"><input type="number" className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs text-right" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} /></td>
                      <td className="py-1.5 px-1"><input type="number" className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs text-right" value={it.discountPct} onChange={(e) => setItem(i, { discountPct: e.target.value })} /></td>
                      <td className="py-1.5 px-1"><input type="number" className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs text-right" value={it.taxRate} onChange={(e) => setItem(i, { taxRate: e.target.value })} /></td>
                      <td className="py-1.5 px-1 text-right font-semibold text-slate-700">{inr(line.amount)}</td>
                      <td className="py-1.5 pl-1"><button onClick={() => removeItem(i)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Payment & Notes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Payment Mode" value={form.paymentMode} onChange={(e: any) => set('paymentMode', e.target.value)} placeholder="Bank Transfer / UPI / Cheque" />
            <Input label="UPI ID" value={form.upiId} onChange={(e: any) => set('upiId', e.target.value)} />
            <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Bank Details</label>
              <textarea value={form.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Notes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-slate-500">Terms & Conditions</label>
              <textarea value={form.termsConditions} onChange={(e) => set('termsConditions', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
          </div>
        </Card>
      </div>

      {/* Sticky totals + actions */}
      <div className="xl:sticky xl:top-2 self-start space-y-3">
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Summary</h3>
          <Row label="Subtotal" value={inr(totals.subtotal)} />
          <Row label="Discount" value={`− ${inr(totals.discountTotal)}`} />
          <Row label="Taxable Amount" value={inr(totals.taxableAmount)} />
          {intraState ? <><Row label="CGST" value={inr(totals.cgst)} /><Row label="SGST" value={inr(totals.sgst)} /></> : <Row label="IGST" value={inr(totals.igst)} />}
          <Row label="Round Off" value={inr(totals.roundOff)} />
          <div className="border-t border-slate-200 mt-2 pt-2 flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-800">Grand Total</span>
            <span className="text-lg font-extrabold text-[#4F7CFF]">{inr(totals.grandTotal)}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">{intraState ? 'Intra-state supply → CGST + SGST.' : 'Inter-state supply → IGST.'} Totals are re-verified on the server.</p>
        </Card>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <Button icon={<CheckCircle2 size={14} />} loading={saving} onClick={() => save(true)}>Generate Invoice</Button>
            <Button variant="outline" icon={<Save size={14} />} loading={saving} onClick={() => save(false)}>Save as Draft</Button>
            <Button variant="ghost" onClick={onDone}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
};
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
  // Load the company's saved Invoice Designer template so print output matches it.
  useEffect(() => { api.invoicing.getSettings().then((s: any) => setDesign(resolveDesign(s))).catch(() => {}); }, []);

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
  const print = async (i: any) => { const full = i.items ? i : await api.invoicing.getInvoice(i.id); printInvoice(full, company, design); api.invoicing.logInvoiceAction(i.id, 'PRINTED').catch(() => {}); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number / customer…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
          {['All', 'Draft', 'Generated', 'Sent', 'Partially Paid', 'Paid', 'Cancelled'].map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
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

      {view && <InvoiceDetailModal invoice={view} company={company} canEdit={canEdit} design={design} onClose={() => setView(null)} onPay={() => { setPayFor(view); }} onChanged={load} />}
      {payFor && <RecordPaymentModal invoice={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); if (view) openView(view.id); }} />}
    </div>
  );
};

const IconBtn: React.FC<{ title: string; tone?: string; onClick: () => void; children: React.ReactNode }> = ({ title, tone, onClick, children }) => {
  const tones: Record<string, string> = { indigo: 'hover:text-indigo-600 hover:bg-indigo-50', violet: 'hover:text-violet-600 hover:bg-violet-50', emerald: 'hover:text-emerald-600 hover:bg-emerald-50', amber: 'hover:text-amber-600 hover:bg-amber-50', rose: 'hover:text-rose-600 hover:bg-rose-50' };
  return <button title={title} onClick={onClick} className={`p-1.5 rounded-lg text-slate-400 ${tones[tone || ''] || 'hover:text-blue-600 hover:bg-blue-50'}`}>{children}</button>;
};

// ── Invoice detail modal ──────────────────────────────────────────────────────
const InvoiceDetailModal: React.FC<{ invoice: any; company: any; canEdit: boolean; design?: InvoiceDesign; onClose: () => void; onPay: () => void; onChanged: () => void }> = ({ invoice, company, canEdit, design, onClose, onPay, onChanged }) => {
  const intra = invoice.cgst > 0;
  return (
    <Modal open onClose={onClose} title={`${invoice.invoiceNumber}`} size="lg"
      footer={<>
        <Button variant="outline" icon={<Printer size={14} />} onClick={() => { printInvoice(invoice, company, design); api.invoicing.logInvoiceAction(invoice.id, 'PRINTED').catch(() => {}); }}>Print / PDF</Button>
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
            <div className="border-t border-slate-200 pt-1 flex justify-between text-sm font-extrabold"><span>Grand Total</span><span className="text-[#4F7CFF]">{inr(invoice.grandTotal)}</span></div>
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
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setModal({ companyName: '', country: 'India', isActive: true })}>Add Customer</Button>}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs min-w-[760px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide"><tr><th className="p-3">Company</th><th className="p-3">GSTIN</th><th className="p-3">Contact</th><th className="p-3 text-center">Invoices</th><th className="p-3 text-right">Outstanding</th><th className="p-3 text-right">Paid</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8}><Empty icon={<Users size={26} />} title="No customers yet" /></td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
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
const CustomerModal: React.FC<{ customer: any; onClose: () => void; onSave: (d: any) => void }> = ({ customer, onClose, onSave }) => {
  const [f, setF] = useState<any>({ ...customer });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit Customer' : 'New Customer'} size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(f)} icon={<Save size={14} />}>Save</Button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Company Name *" value={f.companyName || ''} onChange={(e: any) => set('companyName', e.target.value)} />
        <Input label="Contact Person" value={f.contactPerson || ''} onChange={(e: any) => set('contactPerson', e.target.value)} />
        <Input label="GSTIN" value={f.gstin || ''} onChange={(e: any) => set('gstin', e.target.value)} />
        <Input label="PAN" value={f.pan || ''} onChange={(e: any) => set('pan', e.target.value)} />
        <Input label="Email" value={f.email || ''} onChange={(e: any) => set('email', e.target.value)} />
        <Input label="Phone" value={f.phone || ''} onChange={(e: any) => set('phone', e.target.value)} />
        <Input label="City" value={f.city || ''} onChange={(e: any) => set('city', e.target.value)} />
        <Input label="State" value={f.state || ''} onChange={(e: any) => set('state', e.target.value)} />
        <Input label="Country" value={f.country || 'India'} onChange={(e: any) => set('country', e.target.value)} />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-6"><input type="checkbox" checked={f.isActive !== false} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
        <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Address</label><textarea value={f.addressLine || ''} onChange={(e) => set('addressLine', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
      </div>
    </Modal>
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
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
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
const ProductModal: React.FC<{ product: any; onClose: () => void; onSave: (d: any) => void }> = ({ product, onClose, onSave }) => {
  const [f, setF] = useState<any>({ ...product });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit Product / Service' : 'New Product / Service'} size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(f)} icon={<Save size={14} />}>Save</Button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Name *" value={f.name || ''} onChange={(e: any) => set('name', e.target.value)} />
        <Input label="HSN / SAC Code" value={f.hsnSac || ''} onChange={(e: any) => set('hsnSac', e.target.value)} />
        <Input label="Unit" value={f.unit || 'Nos'} onChange={(e: any) => set('unit', e.target.value)} />
        <Input label="Rate (₹)" type="number" value={f.rate ?? 0} onChange={(e: any) => set('rate', e.target.value)} />
        <Input label="GST %" type="number" value={f.taxRate ?? 0} onChange={(e: any) => set('taxRate', e.target.value)} />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-6"><input type="checkbox" checked={f.isActive !== false} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
        <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Description</label><textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#4F7CFF] focus:outline-none" /></div>
      </div>
    </Modal>
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
const SettingsTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [f, setF] = useState<any>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => { try { setF(await api.invoicing.getSettings()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } })(); }, []);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const save = async () => { setSaving(true); try { const s = await api.invoicing.saveSettings(f); setF(s); ui.toast.success('Settings saved.'); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setSaving(false); } };
  if (!f) return <Empty icon={<SettingsIcon size={26} />} title="Loading settings…" />;
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
        <p className="text-[11px] text-slate-500 mt-2">Tokens: <code>{'{PREFIX} {FY} {YYYY} {MM} {SEQ}'}</code> · Next invoice: <b className="text-[#4F7CFF]">{preview}</b></p>
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
      {canManage && <div className="flex justify-end"><Button loading={saving} onClick={save} icon={<Save size={14} />}>Save Settings</Button></div>}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// A4 PRINT / PDF — opens a print window with a faithful invoice layout
// ══════════════════════════════════════════════════════════════════════════════
function printInvoice(inv: any, company: any, design?: InvoiceDesign) {
  // Renders through the shared invoiceDocHtml so the print output is IDENTICAL to
  // the Invoice Designer's live preview. Branding still comes from BrandingService
  // inside the renderer. `design` defaults to the standard layout (unchanged output).
  const html = invoiceDocHtml(inv, company, design, { print: true });
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { ui.toast.error('Allow pop-ups to print / download the invoice.'); return; }
  w.document.write(html); w.document.close();
}

export default InvoiceManagement;
