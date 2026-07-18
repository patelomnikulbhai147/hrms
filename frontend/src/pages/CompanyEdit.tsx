import React, { useState, useEffect } from 'react';
import { Building2, Save, ChevronRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import type { Company } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

interface CompanyEditProps {
  /** Id of the company to edit — passed through the route (/company-edit/:id). */
  companyId: string | null;
  /** Global companies list (used only as an instant-render fallback while the
      fresh copy loads; the authoritative data is re-fetched from the server). */
  companies: Company[];
  /** Sync the freshly-saved company back into global state so the list row and
      selector update immediately. */
  onUpdateCompanies: (companies: any) => void;
  /** Return to the Companies list (Save success, Cancel, breadcrumb, not-found). */
  onDone: () => void;
  /** Optional full hydrate so the list reflects the saved row on return. */
  onRefresh?: () => void;
}

type EditForm = {
  name: string;
  branchCode: string;
  industry: string;
  adminEmail: string;
  phone: string;
  billingAddress: string;
  domain: string;
  status: 'Active' | 'Inactive' | 'Archived';
  branchSlots: number;
};

// Map a Company record → the editable form (identical mapping to the former
// inline Edit-Company modal, so behaviour is byte-for-byte preserved).
const toForm = (company: any): EditForm => ({
  name: company.name || '',
  branchCode: company.branchCode || company.gstNumber || '',
  industry: company.industry || 'Technology',
  adminEmail: company.adminEmail || company.email || '',
  phone: company.phone || '',
  billingAddress: company.billingAddress || company.address || '',
  domain: company.domain || '',
  status: (company.status as any) || 'Active',
  branchSlots: 1 + (Number(company.purchasedAdditionalBranches) || 0),
});

export const CompanyEdit: React.FC<CompanyEditProps> = ({ companyId, companies, onUpdateCompanies, onDone, onRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [companyName, setCompanyName] = useState('Company');
  const [form, setForm] = useState<EditForm | null>(null);

  // Fetch FRESH company data by id. There is no single-company GET endpoint, so
  // we pull the authoritative list and resolve the row — this guarantees the
  // edit page never shows a stale copy (requirement: "Fetch fresh company data").
  const load = async () => {
    if (!companyId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    try {
      const all = await api.companies.getAll();
      const fresh = (Array.isArray(all) ? all : []).find((c: any) => String(c.id) === String(companyId));
      if (!fresh) {
        // Deleted / invalid id / not visible to this account.
        setNotFound(true);
        return;
      }
      setForm(toForm(fresh));
      setCompanyName(fresh.name || 'Company');
    } catch (e) {
      // Unauthorized / network — fall back to the in-memory row if we have it,
      // otherwise surface a not-found state rather than a blank screen.
      const local = companies.find((c) => String(c.id) === String(companyId));
      if (local) {
        setForm(toForm(local));
        setCompanyName(local.name || 'Company');
      } else {
        setNotFound(true);
        ui.toast.error(getApiErrorMessage(e, 'Could not load the company.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // (Re)load whenever the target company changes (deep link, refresh, or a
  // second Edit click without unmounting).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Open from the very top. The app content lives in a single shared
  // <main class="overflow-y-auto"> whose scroll position is preserved across
  // navigation — opening this page from a long Companies list would otherwise
  // start scrolled down. Reset once loaded (mirrors CompanyProfile).
  useEffect(() => {
    if (loading) return;
    const scroller = document.querySelector('main');
    if (scroller) scroller.scrollTop = 0; else window.scrollTo(0, 0);
  }, [loading]);

  const setField = (patch: Partial<EditForm>) => setForm((p) => (p ? { ...p, ...patch } : p));

  const handleSave = async () => {
    if (!companyId || !form) return;
    if (!form.name.trim()) {
      ui.toast.error('Company Name is required.');
      return;
    }
    setSaving(true);
    try {
      // Identical payload to the former inline modal — same fields, same
      // branch-slot math, same isHeadOffice flag. Save behaviour unchanged.
      const payload = {
        name: form.name,
        branchCode: form.branchCode,
        industry: form.industry,
        adminEmail: form.adminEmail,
        phone: form.phone,
        billingAddress: form.billingAddress,
        domain: form.domain,
        status: form.status,
        purchasedAdditionalBranches: Math.max(0, (Number(form.branchSlots) || 1) - 1),
        isHeadOffice: true,
      };
      const saved = await api.companies.update(companyId, payload);
      // Refresh ONLY the updated row in global state (instant list/selector sync).
      const updatedCompany = { ...companies.find((c) => String(c.id) === String(companyId)), ...saved, isHeadOffice: true };
      onUpdateCompanies(companies.map((c) => (String(c.id) === String(companyId) ? updatedCompany : c)));
      onRefresh?.();
      ui.toast.success('Company details updated successfully.');
      onDone();
    } catch (err) {
      ui.toast.error(getApiErrorMessage(err, 'Could not update the company.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Breadcrumb (shared across every state) ────────────────────────────────
  const Breadcrumbs = () => (
    <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
      <button onClick={onDone} className="hover:text-slate-800 transition-colors">Companies</button>
      <ChevronRight size={13} className="text-slate-300" />
      <span className="text-slate-800">Edit Company</span>
    </nav>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <Breadcrumbs />
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading company…</div>
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <div className="space-y-5">
        <Breadcrumbs />
        <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
          <div className="flex flex-col items-center justify-center text-center py-14">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
              <AlertTriangle className="text-amber-500" size={24} />
            </div>
            <h2 className="text-base font-extrabold text-slate-800 mb-1">Company not available</h2>
            <p className="text-sm text-slate-500 max-w-sm mb-6">
              This company could not be found. It may have been deleted, or you may not have access to it.
            </p>
            <Button variant="outline" onClick={onDone} icon={<ArrowLeft size={14} />}>Back to Companies</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sticky action header — the SINGLE source of truth for Save/Cancel. Stays
          pinned to the top of the scroll area while editing. The negative margins
          full-bleed it across the page's padding so it reads as a clean toolbar,
          and the canvas background hides content scrolling underneath. There is
          intentionally NO duplicate footer action bar. */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 -mt-4 md:-mt-6 pt-4 md:pt-6 pb-3 bg-[var(--surface-canvas)] border-b border-slate-200/70 space-y-3">
        <Breadcrumbs />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FCF4EE] flex items-center justify-center overflow-hidden border border-[#F7E3D3]">
              <Building2 size={20} className="text-[#C77E52]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">{companyName}</h1>
              <p className="text-xs text-slate-500 font-semibold">Edit company profile and configuration.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onDone}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} icon={<Save size={14} />} style={{ backgroundColor: '#B5673A' }}>Save Changes</Button>
          </div>
        </div>
      </div>

      {/* Company Information */}
      <Card className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-800 mb-4">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left font-sans">
          <Input label="Company Name *" value={form.name} onChange={(e) => setField({ name: e.target.value })} />
          <Input label="Company Code" value={form.branchCode} onChange={(e) => setField({ branchCode: e.target.value })} />
          <Input label="Sector / Industry" value={form.industry} onChange={(e) => setField({ industry: e.target.value })} />
          <Input label="Admin Email" type="email" value={form.adminEmail} onChange={(e) => setField({ adminEmail: e.target.value })} />
          <Input label="Phone Number" value={form.phone} onChange={(e) => setField({ phone: e.target.value })} />
          <Input label="Website Domain" value={form.domain} onChange={(e) => setField({ domain: e.target.value })} />
          <Input
            label="Branch Slots (subscription)"
            type="number"
            min={1}
            value={form.branchSlots}
            onChange={(e) => setField({ branchSlots: Math.max(1, parseInt(e.target.value) || 1) })}
          />
          <div className="flex items-end text-[11px] text-slate-500 pb-2">
            Total branches a Company Head may create. Default 1; increase to sell more branch slots.
          </div>
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setField({ status: e.target.value as any })}
            options={[
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'Archived', label: 'Archived' },
            ]}
          />
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Address</label>
            <textarea
              className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              rows={2}
              value={form.billingAddress}
              onChange={(e) => setField({ billingAddress: e.target.value })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};
