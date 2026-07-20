// Invoice detail — professional A4 preview (server-rendered, shown in an iframe)
// alongside status, actions and payment history. Print/Download reuse the same
// server HTML so the on-screen preview === the printed/emailed PDF.
import React, { useEffect, useState, useCallback } from 'react';
import {
  Printer, Download, Mail, CheckCircle2, Ban, Copy, RefreshCw, RotateCcw,
  Plus, X, Wallet,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';
import { INVOICE_STATUS_VARIANT } from './calc';

const PAY_METHODS = ['Bank Transfer', 'UPI', 'Card', 'Cash', 'Cheque', 'Other'];

export const InvoiceDetailModal: React.FC<{ invoiceId: number; onClose: () => void; onChanged: () => void }> = ({ invoiceId, onClose, onChanged }) => {
  const [inv, setInv] = useState<any>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ amount: 0, method: 'Bank Transfer', referenceNo: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, h] = await Promise.all([api.subscriptionInvoices.get(invoiceId), api.subscriptionInvoices.fetchHtml(invoiceId).catch(() => '')]);
      setInv(d); setHtml(h);
      setPay((p) => ({ ...p, amount: Math.max(0, (d.grandTotal || 0) - (d.amountPaid || 0)) }));
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    try { await fn(); ui.toast.success(okMsg); await load(); onChanged(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

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
  const settled = inv && ['Paid', 'Cancelled', 'Refunded'].includes(inv.status);

  return (
    <Modal
      open onClose={onClose} variant="page"
      title={inv ? `Invoice ${inv.invoiceNo}` : 'Invoice'}
      subtitle={inv ? `${inv.companyName} · ${inv.plan} · ${inv.billingCycle}` : ''}
      breadcrumbs={[{ label: 'Billing & Invoices', onClick: onClose }, { label: inv?.invoiceNo || 'Invoice' }]}
      footer={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" variant="outline" icon={<Printer size={14} />} onClick={printDoc}>Print</Button>
            <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={printDoc}>Download PDF</Button>
            <Button size="sm" variant="outline" icon={<Mail size={14} />} onClick={email} loading={busy}>Email</Button>
            <Button size="sm" variant="outline" icon={<Copy size={14} />} onClick={duplicate}>Duplicate</Button>
            <Button size="sm" variant="outline" icon={<RefreshCw size={14} />} onClick={regenerate}>Regenerate</Button>
            <Button size="sm" variant="outline" icon={<RotateCcw size={14} />} onClick={renew}>Renew</Button>
          </div>
          <div className="flex items-center gap-1.5">
            {!settled && <Button size="sm" variant="outline" icon={<Ban size={14} />} onClick={cancel}>Cancel</Button>}
            {!settled && <Button size="sm" icon={<CheckCircle2 size={14} />} onClick={markPaid}>Mark Paid</Button>}
            <Button size="sm" variant="outline" icon={<X size={14} />} onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      {loading || !inv ? (
        <div className="py-16 text-center text-ink-muted text-sm">Loading invoice…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {/* A4 preview */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-hairline bg-slate-100">
            {html ? (
              <iframe title="Invoice" srcDoc={html} className="w-full" style={{ height: '900px', border: 'none', background: '#f1f5f9' }} />
            ) : (
              <div className="py-16 text-center text-ink-muted text-sm">Preview unavailable.</div>
            )}
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">Status</span>
                <Badge variant={INVOICE_STATUS_VARIANT[inv.status] || 'gray'} dot>{inv.status}</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-[13px]">
                <SideRow label="Grand Total" value={inr(inv.grandTotal)} bold />
                <SideRow label="Paid" value={inr(inv.amountPaid)} />
                <SideRow label="Balance Due" value={inr(balance)} bold={balance > 0} danger={balance > 0} />
                <SideRow label="GST" value={`${inr(inv.gstAmount)} (${inv.gstPercent}%)`} />
                <SideRow label="Renewal" value={inv.renewalStatus} />
              </div>
              {!settled && (
                <Button size="sm" variant="outline" className="w-full mt-3" icon={<Plus size={14} />} onClick={() => setShowPay((v) => !v)}>Record Payment</Button>
              )}
            </div>

            {showPay && !settled && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4 space-y-2">
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

            <div className="rounded-2xl border border-hairline overflow-hidden">
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
          </div>
        </div>
      )}
    </Modal>
  );
};

const SideRow: React.FC<{ label: string; value: any; bold?: boolean; danger?: boolean }> = ({ label, value, bold, danger }) => (
  <div className="flex items-center justify-between">
    <span className="text-ink-secondary">{label}</span>
    <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${danger ? 'text-rose-600' : 'text-ink'}`}>{value}</span>
  </div>
);

export default InvoiceDetailModal;
