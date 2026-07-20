// Generate Invoice — pick a company, auto-load its plan/headcount/rate, auto-calc
// subtotal/GST/discount/grand total live, then create a real invoice.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Save, X, Building2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';
import { computeInvoice } from './calc';

interface Props {
  companies: any[];              // rows from api.subscriptions.list()
  settings: any;                 // platform settings (taxPercent, invoiceTerms…)
  onClose: () => void;
  onCreated: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

export const GenerateInvoiceModal: React.FC<Props> = ({ companies, settings, onClose, onCreated }) => {
  const [companyId, setCompanyId] = useState<string>('');
  const [plan, setPlan] = useState('Free');
  const [billingCycle, setBillingCycle] = useState<'Quarterly' | 'Yearly'>('Quarterly');
  const [employeeCount, setEmployeeCount] = useState(0);
  const [pricePerEmployee, setPricePerEmployee] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [gstPercent, setGstPercent] = useState(Number(settings?.taxPercent) || 18);
  const [interState, setInterState] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(Number(settings?.gracePeriodDays) || 7));
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(settings?.invoiceTerms || 'Payment due within the stated period. Subscription remains active on timely payment.');
  const [saving, setSaving] = useState(false);

  // Auto-load from the selected company subscription row.
  const onPickCompany = (id: string) => {
    setCompanyId(id);
    const row = companies.find((c) => String(c.companyId) === String(id));
    if (row) {
      setPlan(row.plan || 'Free');
      setBillingCycle((row.billingCycle as any) || 'Quarterly');
      setEmployeeCount(Number(row.employees) || 0);
      setPricePerEmployee(Number(row.pricePerEmployee) || 0);
      setDiscountPercent(Number(row.discountPercent) || 0);
    }
  };

  // When cycle changes, refresh the per-employee rate from the picked company's
  // catalog price if we can infer it (row only has current-cycle rate) — otherwise
  // leave the admin's value. Keep it simple: recompute rate from plan catalog note.
  const money = useMemo(() => computeInvoice({ employeeCount, pricePerEmployee, discountPercent, gstPercent, interState }), [employeeCount, pricePerEmployee, discountPercent, gstPercent, interState]);

  const create = async () => {
    if (!companyId) { ui.toast.error('Select a company first.'); return; }
    setSaving(true);
    try {
      await api.subscriptionInvoices.generate({
        companyId: Number(companyId), plan, billingCycle, employeeCount, pricePerEmployee,
        discountPercent, gstPercent, interState, invoiceDate, dueDate, notes, terms,
      });
      ui.toast.success('Invoice generated.');
      onCreated();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
  const labelCls = 'text-[12px] font-semibold text-ink-secondary mb-1 block';

  return (
    <Modal
      open onClose={onClose} size="xl" title="Generate Invoice"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" icon={<X size={15} />} onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} />} onClick={create} loading={saving} disabled={!companyId}>Generate Invoice</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Form */}
        <div className="lg:col-span-3 space-y-3">
          <div>
            <label className={labelCls}>Company</label>
            <div className="relative">
              <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <select value={companyId} onChange={(e) => onPickCompany(e.target.value)} className={`${inputCls} pl-9`}>
                <option value="">Select a company…</option>
                {companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.companyName} — {c.plan} ({c.employees} emp)</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Plan</label>
              <input className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Billing Cycle</label>
              <select className={inputCls} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as any)}>
                <option>Quarterly</option><option>Yearly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Employee Count</label>
              <input type="number" className={inputCls} value={employeeCount} onChange={(e) => setEmployeeCount(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Price / Employee (₹)</label>
              <input type="number" className={inputCls} value={pricePerEmployee} onChange={(e) => setPricePerEmployee(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Discount (%)</label>
              <input type="number" className={inputCls} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>GST (%)</label>
              <input type="number" className={inputCls} value={gstPercent} onChange={(e) => setGstPercent(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Invoice Date</label>
              <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink-secondary cursor-pointer">
            <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} className="accent-brand-600" />
            Inter-state supply (charge IGST instead of CGST + SGST)
          </label>

          <div>
            <label className={labelCls}>Notes</label>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note shown on the invoice" />
          </div>
          <div>
            <label className={labelCls}>Terms &amp; Conditions</label>
            <textarea className={`${inputCls} h-16 py-2 resize-none`} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
        </div>

        {/* Live auto-calculation */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 sticky top-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-700 uppercase tracking-wider"><Sparkles size={13} /> Auto-calculated</div>
            <Row label={`Subtotal (${employeeCount} × ${inr(pricePerEmployee)})`} value={inr(money.subtotal)} />
            {money.discountAmount > 0 && <Row label={`Discount (${discountPercent}%)`} value={`− ${inr(money.discountAmount)}`} green />}
            <Row label="Taxable Value" value={inr(money.taxable)} />
            {interState ? (
              <Row label={`IGST (${gstPercent}%)`} value={inr(money.igst)} />
            ) : (
              <>
                <Row label={`CGST (${gstPercent / 2}%)`} value={inr(money.cgst)} />
                <Row label={`SGST (${gstPercent / 2}%)`} value={inr(money.sgst)} />
              </>
            )}
            <div className="mt-2 pt-2 border-t border-brand-200 flex items-center justify-between">
              <span className="text-sm font-bold text-ink">Grand Total</span>
              <span className="text-2xl font-extrabold text-brand-700 tabular-nums">{inr(money.grandTotal)}</span>
            </div>
            <p className="text-[11px] text-ink-muted mt-2">Amounts recompute on the server when you generate — no manual entry.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; green?: boolean }> = ({ label, value, green }) => (
  <div className="flex items-center justify-between py-1 text-[13px]">
    <span className="text-ink-secondary">{label}</span>
    <span className={`tabular-nums font-semibold ${green ? 'text-emerald-600' : 'text-ink'}`}>{value}</span>
  </div>
);

export default GenerateInvoiceModal;
