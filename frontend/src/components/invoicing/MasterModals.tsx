// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER / PRODUCT master modals.
//
// These were defined privately inside InvoiceManagement.tsx, which meant the
// invoice editor could not offer "+ Create New Customer / Product" without a
// second, drifting copy of the same form. They now live here and are used by
// BOTH the Customers / Products & Services tabs and the Create-Invoice pickers,
// so there is exactly one definition of each form.
//
// Unchanged from the originals: same fields, same defaults, same save contract
// (`onSave(formData)` — the caller owns the API call and the toast).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Save } from 'lucide-react';

export const CustomerModal: React.FC<{ customer: any; onClose: () => void; onSave: (d: any) => void }> = ({ customer, onClose, onSave }) => {
  const [f, setF] = useState<any>({ ...customer });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit Customer' : 'New Customer'} size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(f)} icon={<Save size={14} />}>Save</Button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-bold text-slate-500">Client Code</label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-[#C77E52]">{f.customerCode || 'Auto-assigned on save'}</div>
        </div>
        <Input label="Company Name *" value={f.companyName || ''} onChange={(e: any) => set('companyName', e.target.value)} />
        <Input label="Contact Person" value={f.contactPerson || ''} onChange={(e: any) => set('contactPerson', e.target.value)} />
        <Input label="GSTIN" value={f.gstin || ''} onChange={(e: any) => set('gstin', e.target.value)} />
        <Input label="PAN" value={f.pan || ''} onChange={(e: any) => set('pan', e.target.value)} />
        <Input label="Email" value={f.email || ''} onChange={(e: any) => set('email', e.target.value)} />
        <Input label="Phone" value={f.phone || ''} onChange={(e: any) => set('phone', e.target.value)} />
        <Input label="City" value={f.city || ''} onChange={(e: any) => set('city', e.target.value)} />
        <Input label="State" value={f.state || ''} onChange={(e: any) => set('state', e.target.value)} />
        <Input label="Country" value={f.country || 'India'} onChange={(e: any) => set('country', e.target.value)} />
        <Input label="Payment Terms" value={f.paymentTerms || ''} onChange={(e: any) => set('paymentTerms', e.target.value)} placeholder="e.g. Net 30" />
        <Input label="Credit Days" type="number" value={f.creditDays ?? ''} onChange={(e: any) => set('creditDays', e.target.value)} placeholder="e.g. 30" />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-6"><input type="checkbox" checked={f.isActive !== false} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
        <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Billing Address</label><textarea value={f.addressLine || ''} onChange={(e) => set('addressLine', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Shipping Address <span className="font-normal text-slate-400">(default; auto-filled onto new invoices)</span></label><textarea value={f.shipToAddress || ''} onChange={(e) => set('shipToAddress', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
      </div>
    </Modal>
  );
};

export const ProductModal: React.FC<{ product: any; onClose: () => void; onSave: (d: any) => void }> = ({ product, onClose, onSave }) => {
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
        <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-bold text-slate-500">Description</label><textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs focus:border-[#C77E52] focus:outline-none" /></div>
      </div>
    </Modal>
  );
};
