import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Trash2, Inbox, Eye, Edit2, Search, ExternalLink, Send, ArrowRightCircle, ChevronLeft, Save, ChevronDown, FileSpreadsheet, FileText, Archive } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { exportRowsToExcel, exportRowsToPDF } from '@/utils/exportUtils';
import { useDismissable } from '@/hooks/useDismissable';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { ui } from '@/components/ui/feedback';

const TENDER_REPORT_COLS = [
  { header: 'Tender No', key: 'tenderNumber', width: 16 },
  { header: 'Name', key: 'tenderName', width: 28 },
  { header: 'Client', key: 'clientName', width: 22 },
  { header: 'Service', key: 'serviceType', width: 16 },
  { header: 'Value', key: 'tenderValue', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'End Date', key: 'endDate', width: 14, format: (v: any) => formatDate(v) },
];

// Section wrapper for the full-page form — a titled block with a responsive grid.
const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
    <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
  </div>
);

// Tender lifecycle statuses (business opportunity pipeline).
const TENDER_STATUSES = ['Draft', 'Live', 'Submitted', 'Under Review', 'Won', 'Lost', 'Cancelled'];
const CATEGORIES = ['Government', 'Private', 'HR Service', 'Recruitment', 'Vendor'];
const statusVariant = (s: string): any =>
  s === 'Won' ? 'green' : s === 'Lost' || s === 'Cancelled' ? 'red' : s === 'Under Review' ? 'indigo' : s === 'Submitted' ? 'blue' : s === 'Live' ? 'sky' : 'amber';

// Operational tender buckets. The "Upcoming" tab/card was removed — draft tenders
// now live under "Live" so no record is hidden. Each tab maps to existing status
// data (statuses themselves are UNCHANGED).
type TenderTab = 'live' | 'submitted' | 'awarded' | 'closed' | 'cancelled';
const TENDER_TABS: { id: TenderTab; label: string; statuses: string[] }[] = [
  { id: 'live', label: 'Live Tenders', statuses: ['Draft', 'Live'] },
  { id: 'submitted', label: 'Submitted', statuses: ['Submitted', 'Under Review'] },
  { id: 'awarded', label: 'Awarded', statuses: ['Won'] },
  { id: 'closed', label: 'Closed', statuses: ['Lost'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['Cancelled'] },
];

interface Props {
  activeCompanyId: string;
  canManageCommercial: boolean;
  onConverted?: () => void;
  onChanged?: () => void;
}

export const TendersTab: React.FC<Props> = ({ activeCompanyId, canManageCommercial, onConverted, onChanged }) => {
  const [tenders, setTenders] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [viewTender, setViewTender] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TenderTab>('live');
  // Controlled "Actions ▼" menu — operational tools only (export + archived view).
  // No tender creation or import is exposed anywhere in the UI by design.
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useDismissable(actionsOpen, () => setActionsOpen(false), actionsRef);

  const load = useCallback(async () => { try { setTenders(await api.tenders.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId]);

  // Dashboard card counts (independent of the active tab). Mirror the tab buckets.
  const counts = useMemo(() => {
    const by = (statuses: string[]) => tenders.filter(t => statuses.includes(t.status)).length;
    return {
      live: by(['Draft', 'Live']),
      submitted: by(['Submitted', 'Under Review']),
      awarded: by(['Won']),
      closed: by(['Lost']),
      cancelled: by(['Cancelled']),
    };
  }, [tenders]);

  const activeStatuses = useMemo(() => TENDER_TABS.find(t => t.id === tab)?.statuses || [], [tab]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t =>
      activeStatuses.includes(t.status) &&
      (!q || `${t.tenderName} ${t.tenderNumber || ''} ${t.clientName || ''} ${t.serviceType || ''}`.toLowerCase().includes(q)));
  }, [tenders, search, activeStatuses]);

  const emptyForm = { tenderNumber: '', tenderName: '', clientName: '', serviceType: '', category: 'Government', tenderValue: '', startDate: '', endDate: '', closingDate: '', status: 'Draft', documentPath: '', remarks: '' };
  const [form, setForm] = useState<any>(emptyForm);

  // ── Actions ▼ menu handlers ──
  // "Create New Tender" and "Import Tender" were removed from the UI by design.
  // Tenders are managed via existing records only (view / edit / status / convert).
  // Any future creation must come through a controlled internal workflow for
  // authorized users — never a visible Create/Import button. The Actions menu now
  // exposes only operational tools (export + archived view).
  const handleViewArchived = () => { setActionsOpen(false); setTab('cancelled'); };
  const runExport = (format: 'excel' | 'pdf') => {
    setActionsOpen(false);
    try {
      if (!rows.length) { ui.toast.info('There are no tenders to export for the current view.'); return; }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'excel') exportRowsToExcel(`Tender_Report_${stamp}`, TENDER_REPORT_COLS, rows, 'Tenders');
      else exportRowsToPDF(`Tender_Report_${stamp}`, 'Tender Report', TENDER_REPORT_COLS, rows);
    } catch (err: any) { ui.toast.error('Export failed: ' + (err?.message || 'Unknown error')); }
  };
  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      tenderNumber: t.tenderNumber || '', tenderName: t.tenderName || '', clientName: t.clientName || '', serviceType: t.serviceType || '',
      category: t.category || 'Government', tenderValue: t.tenderValue || '',
      startDate: (t.startDate || '').slice(0, 10), endDate: (t.endDate || '').slice(0, 10), closingDate: (t.closingDate || '').slice(0, 10),
      status: t.status || 'Draft', documentPath: t.documentPath || '', remarks: t.remarks || t.notes || '',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!form.tenderName.trim()) { ui.toast.warning('Tender name is required.'); return; }
    setBusy(true);
    try {
      if (editingId) { await api.tenders.update(editingId, form); ui.toast.success('Tender updated.'); }
      else { await api.tenders.create({ ...form, companyId: activeCompanyId }); ui.toast.success('Tender created.'); }
      setCreateOpen(false); setEditingId(null); setForm(emptyForm); await load(); onChanged?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const setStatus = async (t: any, status: string) => {
    try { await api.tenders.update(t.id, { status }); ui.toast.success(`Tender marked ${status}.`); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Update failed.'); }
  };

  const convert = async (t: any) => {
    if (!(await ui.confirm({ title: 'Convert to Contract', message: `Create a contract from won tender "${t.tenderName}"? The contract is auto-filled from the tender.`, confirmText: 'Convert' }))) return;
    try {
      const res = await api.tenders.convert(t.id);
      ui.toast.success(res?.alreadyConverted ? 'Tender already had a contract — opened it.' : 'Contract created from tender.');
      await load(); onConverted?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Conversion failed.'); }
  };

  const remove = async (id: any) => {
    if (!(await ui.confirm({ message: 'Permanently delete this tender?', confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.tenders.remove(id); ui.toast.success('Tender deleted.'); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Delete failed.'); }
  };

  const closeForm = () => { setCreateOpen(false); setEditingId(null); };

  // ── Dedicated full-page form (no modal — always fully visible) ──
  if (createOpen) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <button onClick={closeForm} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition"><ChevronLeft size={15} /> Back to tenders</button>
          <h3 className="text-base font-extrabold text-slate-800">{editingId ? 'Edit Tender' : 'Create Tender'}</h3>
        </div>
        <div className="space-y-4 max-w-5xl">
          <FormSection title="Tender Details">
            <Input label="Tender Number" value={form.tenderNumber} onChange={e => setForm({ ...form, tenderNumber: e.target.value })} />
            <Input label="Tender Name *" value={form.tenderName} onChange={e => setForm({ ...form, tenderName: e.target.value })} />
            <Input label="Service Type" placeholder="Security / Housekeeping / Manpower…" value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} />
            <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            <Input label="Tender Value (₹)" type="number" value={form.tenderValue} onChange={e => setForm({ ...form, tenderValue: e.target.value })} />
          </FormSection>
          <FormSection title="Client Information">
            <Input label="Client Name" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
          </FormSection>
          <FormSection title="Dates & Status">
            <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <Input label="End Date" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            <Input label="Closing Date" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={TENDER_STATUSES.map(s => ({ value: s, label: s }))} />
          </FormSection>
          <FormSection title="Documents & Notes">
            <div className="sm:col-span-2 lg:col-span-3"><Input label="Document Link / Attachment URL" placeholder="https://… or document reference" value={form.documentPath} onChange={e => setForm({ ...form, documentPath: e.target.value })} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><Textarea label="Remarks" rows={3} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </FormSection>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button icon={<Save size={14} />} loading={busy} onClick={submit}>{editingId ? 'Update Tender' : 'Save Tender'}</Button>
          </div>
        </div>
      </div>
    );
  }

  const CARDS: { label: string; value: number; tone: string }[] = [
    { label: 'Live Tenders', value: counts.live, tone: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white text-sky-700' },
    { label: 'Submitted', value: counts.submitted, tone: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-700' },
    { label: 'Awarded', value: counts.awarded, tone: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-700' },
    { label: 'Closed', value: counts.closed, tone: 'border-rose-200 bg-gradient-to-br from-rose-50 to-white text-rose-700' },
    { label: 'Cancelled', value: counts.cancelled, tone: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white text-slate-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARDS.map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.tone}`}>
            <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{c.label}</p>
            <p className="text-3xl font-extrabold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {TENDER_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{t.label}</button>
        ))}
      </div>

      <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800">{TENDER_TABS.find(t => t.id === tab)?.label} Tenders</h3>
        <div className="flex items-center gap-2">
          <Input icon={<Search size={14} />} placeholder="Search tenders…" value={search} onChange={e => setSearch(e.target.value)} />
          {/* Controlled Actions ▼ menu — tender creation is no longer a standalone
              button; all authorized actions live here. Available to Company Head /
              Super Admin only (the whole module is leadership-gated). */}
          {canManageCommercial && (
            <div className="relative shrink-0" ref={actionsRef}>
              <Button onClick={() => setActionsOpen(o => !o)}>
                <span className="flex items-center gap-1.5">Actions <ChevronDown size={14} className={`transition-transform ${actionsOpen ? 'rotate-180' : ''}`} /></span>
              </Button>
              {actionsOpen && (
                <div className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                  <button onClick={() => runExport('excel')} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-emerald-50 hover:text-emerald-700"><FileSpreadsheet size={15} className="text-emerald-600" /> Export to Excel</button>
                  <button onClick={() => runExport('pdf')} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-rose-50 hover:text-rose-700"><FileText size={15} className="text-rose-600" /> Export to PDF</button>
                  <div className="h-px bg-slate-100" />
                  <button onClick={handleViewArchived} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-slate-600 text-left transition-colors hover:bg-slate-50 hover:text-slate-900"><Archive size={15} className="text-slate-400" /> Archived Tenders</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No tenders yet</p>
          <p className="text-xs text-slate-400 mt-1">No tenders to show.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Tender No</Th><Th>Name</Th><Th>Client</Th><Th>Service</Th><Th>Value</Th><Th>End Date</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {rows.map(t => (
                <Tr key={t.id}>
                  <Td><span className="font-mono text-[11px] text-indigo-700">{t.tenderNumber || '—'}</span></Td>
                  <Td><span className="font-semibold text-slate-800">{t.tenderName}</span></Td>
                  <Td>{t.clientName || '—'}</Td>
                  <Td>{t.serviceType ? <Badge variant="indigo">{t.serviceType}</Badge> : '—'}</Td>
                  <Td>{t.tenderValue ? `₹${Number(t.tenderValue).toLocaleString('en-IN')}` : '—'}</Td>
                  <Td><span className="text-[11px] text-slate-500">{formatDate(t.endDate || t.closingDate)}</span></Td>
                  <Td><Badge variant={statusVariant(t.status)}>{t.status}</Badge>{t.convertedContractId && <span className="ml-1 text-[9px] font-bold text-emerald-600">✓ Contract</span>}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewTender(t)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
                      {canManageCommercial && <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                      {canManageCommercial && t.status === 'Draft' && <button onClick={() => setStatus(t, 'Live')} title="Mark Live" className="p-1.5 rounded-md border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 shadow-sm"><Send size={13} /></button>}
                      {canManageCommercial && t.status === 'Live' && <button onClick={() => setStatus(t, 'Submitted')} title="Submit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Send size={13} /></button>}
                      {canManageCommercial && t.status === 'Won' && !t.convertedContractId && <button onClick={() => convert(t)} title="Convert to Contract" className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm"><ArrowRightCircle size={13} /></button>}
                      {canManageCommercial && <button onClick={() => remove(t.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* View detail */}
      <Modal open={!!viewTender} onClose={() => setViewTender(null)} title={viewTender?.tenderName || 'Tender'}
        footer={<div className="flex justify-end gap-2">
          {viewTender && canManageCommercial && viewTender.status === 'Won' && !viewTender.convertedContractId &&
            <Button icon={<ArrowRightCircle size={14} />} onClick={() => { const t = viewTender; setViewTender(null); convert(t); }}>Convert to Contract</Button>}
          <Button variant="outline" onClick={() => setViewTender(null)}>Close</Button>
        </div>}>
        {viewTender && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Badge variant={statusVariant(viewTender.status)}>{viewTender.status}</Badge>{viewTender.serviceType && <Badge variant="indigo">{viewTender.serviceType}</Badge>}</div>
            {[
              ['Tender Number', viewTender.tenderNumber || '—'],
              ['Client', viewTender.clientName || '—'],
              ['Value', viewTender.tenderValue ? `₹${Number(viewTender.tenderValue).toLocaleString('en-IN')}` : '—'],
              ['Start Date', formatDate(viewTender.startDate)],
              ['End Date', formatDate(viewTender.endDate || viewTender.closingDate)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold">{v}</span></div>
            ))}
            {viewTender.documentPath && (
              <a href={viewTender.documentPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline pt-1"><ExternalLink size={13} /> Open attachment</a>
            )}
            {(viewTender.remarks || viewTender.notes) && <div className="pt-2"><p className="text-[10px] text-slate-400 uppercase font-bold">Remarks</p><p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{viewTender.remarks || viewTender.notes}</p></div>}
          </div>
        )}
      </Modal>
      </Card>
    </div>
  );
};

export default TendersTab;
