import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Briefcase, Trash2, Inbox, Eye, Edit2, Search, ExternalLink, Send, ArrowRightCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save, ChevronDown, FileSpreadsheet, FileText, Archive, AlertTriangle, RefreshCw } from 'lucide-react';
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
const OUTCOME_OPTIONS = [
  { value: 'UNDER_EVALUATION', label: '🟡 Under Evaluation' },
  { value: 'AWARDED', label: '🟢 Awarded' },
  { value: 'NOT_AWARDED', label: '🔴 Not Awarded' },
  { value: 'WITHDRAWN', label: '⚪ Withdrawn' },
];

const statusVariant = (s: string): any =>
  s === 'Won' ? 'green' : s === 'Lost' || s === 'Cancelled' ? 'red' : s === 'Under Review' ? 'indigo' : s === 'Submitted' ? 'blue' : s === 'Live' ? 'sky' : 'amber';

type TenderTab = 'live' | 'submitted' | 'awarded' | 'closed' | 'cancelled';
const TENDER_TABS: { id: TenderTab; label: string; statuses: string[] }[] = [
  { id: 'live', label: 'Live Tenders', statuses: ['Draft', 'Live'] },
  { id: 'submitted', label: 'Submitted', statuses: ['Submitted', 'Under Review'] },
  { id: 'awarded', label: 'Awarded', statuses: ['Won'] },
  { id: 'closed', label: 'Closed', statuses: ['Lost', 'Closed'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['Cancelled'] },
];

// Helper to check if a tender's closing date has passed (Expired/Closed)
const isTenderExpired = (t: any): boolean => {
  const dtStr = t.closingDate || t.endDate;
  if (!dtStr) return false;
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

// Check if tender is submitted / in submission pipeline
const isTenderSubmitted = (t: any): boolean => {
  if (['Submitted', 'Under Review'].includes(t.status)) return true;
  if (t.submissionOutcome && t.submissionOutcome !== 'NOT_SUBMITTED') return true;
  return false;
};

// Check if tender is won / awarded
const isTenderAwarded = (t: any): boolean => {
  if (t.status === 'Won' || t.submissionOutcome === 'AWARDED') return true;
  return false;
};

// Helper to filter tenders into appropriate tab buckets
const filterTendersForTab = (allTenders: any[], currentTab: TenderTab): any[] => {
  return allTenders.filter(t => {
    const expired = isTenderExpired(t);
    const submitted = isTenderSubmitted(t);
    const awarded = isTenderAwarded(t);

    if (currentTab === 'cancelled') {
      return t.status === 'Cancelled';
    }

    if (currentTab === 'awarded') {
      return awarded;
    }

    if (currentTab === 'submitted') {
      return submitted && !awarded;
    }

    if (currentTab === 'closed') {
      if (submitted || awarded) return false; // Submitted tenders stay in Submitted/Awarded
      return t.status === 'Lost' || t.status === 'Closed' || expired;
    }

    if (currentTab === 'live') {
      if (submitted || awarded || expired || t.status === 'Cancelled' || t.status === 'Lost' || t.status === 'Closed') {
        return false;
      }
      return t.status === 'Draft' || t.status === 'Live';
    }

    return false;
  });
};

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

  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useDismissable(actionsOpen, () => setActionsOpen(false), actionsRef);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [submittingTender, setSubmittingTender] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [bidNotes, setBidNotes] = useState<string>('');
  const [bidBusy, setBidBusy] = useState<boolean>(false);

  const [outcomeTender, setOutcomeTender] = useState<any>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('UNDER_EVALUATION');
  const [outcomeBusy, setOutcomeBusy] = useState<boolean>(false);

  const openSubmitModal = (t: any) => {
    if (isTenderSubmitted(t)) {
      openOutcomeModal(t);
      return;
    }
    setSubmittingTender(t);
    setBidAmount(t.tenderValue ? String(t.tenderValue) : '');
    setBidNotes('');
  };

  const handleConfirmSubmit = async () => {
    if (!submittingTender) return;
    setBidBusy(true);
    try {
      const updatedNotes = bidNotes.trim()
        ? `${submittingTender.notes || submittingTender.remarks || ''}\n[Submitted Bid Note]: ${bidNotes.trim()}`.trim()
        : (submittingTender.notes || submittingTender.remarks || null);

      const payload: any = {
        status: 'Submitted',
        submissionOutcome: 'UNDER_EVALUATION',
        submissionDate: new Date().toISOString().slice(0, 10),
        notes: updatedNotes,
      };
      if (bidAmount && !isNaN(Number(bidAmount)) && Number(bidAmount) > 0) {
        payload.quotedValue = Number(bidAmount);
      }

      await api.tenders.update(submittingTender.id, payload);
      ui.toast.success(`Tender submitted successfully!`);
      setSubmittingTender(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Failed to submit tender.');
    } finally {
      setBidBusy(false);
    }
  };

  const openOutcomeModal = (t: any) => {
    setOutcomeTender(t);
    setSelectedOutcome(t.submissionOutcome || 'UNDER_EVALUATION');
  };

  const handleSaveOutcome = async () => {
    if (!outcomeTender) return;
    setOutcomeBusy(true);
    try {
      await api.tenders.update(outcomeTender.id, {
        submissionOutcome: selectedOutcome,
      });
      ui.toast.success(`Outcome updated successfully!`);
      setOutcomeTender(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Failed to update outcome.');
    } finally {
      setOutcomeBusy(false);
    }
  };

  const renderStatusBadge = (t: any) => {
    if (!t) return null;
    const expired = isTenderExpired(t);
    const submitted = isTenderSubmitted(t);
    const awarded = isTenderAwarded(t);

    if (awarded) {
      return <Badge variant="green">🟢 Awarded</Badge>;
    }
    if (t.submissionOutcome === 'NOT_AWARDED') {
      return <Badge variant="red">🔴 Not Awarded</Badge>;
    }
    if (t.submissionOutcome === 'WITHDRAWN') {
      return <Badge variant="slate">⚪ Withdrawn</Badge>;
    }
    if (submitted) {
      return <Badge variant="amber">🟡 Under Evaluation</Badge>;
    }
    if (expired) {
      return <Badge variant="red">🔴 Closed</Badge>;
    }
    return <Badge variant={statusVariant(t.status)}>{t.status}</Badge>;
  };

  const renderActionCell = (t: any) => {
    if (!t) return null;
    const expired = isTenderExpired(t);
    const submitted = isTenderSubmitted(t);
    const awarded = isTenderAwarded(t);

    if (awarded) {
      if (!t.convertedContractId && canManageCommercial) {
        return (
          <Button
            size="xs"
            variant="success"
            onClick={(e) => {
              e.stopPropagation();
              convert(t);
            }}
            className="font-bold px-3 py-1 text-xs"
          >
            Convert to Contract
          </Button>
        );
      }
      return <span className="text-[10px] font-extrabold text-emerald-600">✓ Contract Created</span>;
    }

    if (submitted) {
      return (
        <Button
          size="xs"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            openOutcomeModal(t);
          }}
          className="font-bold px-3 py-1 text-xs border-brand-300 text-brand-700 hover:bg-brand-50"
        >
          Update Outcome
        </Button>
      );
    }

    if (expired) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
          🔴 Closed
        </span>
      );
    }

    return (
      <Button
        size="xs"
        variant="primary"
        onClick={(e) => {
          e.stopPropagation();
          openSubmitModal(t);
        }}
        className="font-bold px-4 py-1 text-xs shadow-sm"
      >
        Submit
      </Button>
    );
  };

  const load = useCallback(async () => { try { setTenders(await api.tenders.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId]);

  // Dashboard card counts (independent of the active tab). Computed dynamically from MySQL DB.
  const counts = useMemo(() => {
    return {
      live: filterTendersForTab(tenders, 'live').length,
      submitted: filterTendersForTab(tenders, 'submitted').length,
      awarded: filterTendersForTab(tenders, 'awarded').length,
      closed: filterTendersForTab(tenders, 'closed').length,
      cancelled: filterTendersForTab(tenders, 'cancelled').length,
    };
  }, [tenders]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tabItems = filterTendersForTab(tenders, tab);
    if (!q) return tabItems;
    return tabItems.filter(t =>
      `${t.tenderName || ''} ${t.tenderNumber || ''} ${t.clientName || ''} ${t.serviceType || ''} ${t.category || ''} ${t.department || ''} ${t.externalId || ''}`.toLowerCase().includes(q)
    );
  }, [tenders, search, tab]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  const emptyForm = { tenderNumber: '', tenderName: '', clientName: '', serviceType: '', category: 'Government', tenderValue: '', startDate: '', endDate: '', closingDate: '', status: 'Draft', documentPath: '', remarks: '' };
  const [form, setForm] = useState<any>(emptyForm);

  // ── Actions ▼ menu handlers ──
  // "Create New Tender" and "Import Tender" were removed from the UI by design.
  // Tenders are managed via existing records only (view / edit / status / convert).
  // Any future creation must come through a controlled internal workflow for
  // authorized users — never a visible Create/Import button. The Actions menu now
  // exposes only operational tools (export + archived view).
  const handleSyncExternal = async () => {
    if (syncing) return;
    setActionsOpen(false);
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await api.tenders.syncExternal();
      if (response && response.success === false) {
        const errorMsg = response.error || response.message || 'TenderGuruji sync failed';
        setSyncError(errorMsg);
      } else {
        const count = response?.synced ?? 0;
        if (count === 0) {
          ui.toast.success('Sync completed — no new tenders found');
        } else {
          ui.toast.success(`${count} tenders synchronized successfully`);
        }
        await load();
        onChanged?.();
      }
    } catch (e: any) {
      const errorMsg = e?.error || e?.message || 'Unable to sync tenders.';
      setSyncError(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

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
          <button onClick={closeForm} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-600 transition"><ChevronLeft size={15} /> Back to tenders</button>
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
    { label: 'Live Tenders', value: counts.live, tone: 'border-brand-200 bg-gradient-to-br from-brand-50 to-white text-brand-700' },
    { label: 'Submitted', value: counts.submitted, tone: 'border-brand-200 bg-gradient-to-br from-brand-50 to-white text-brand-700' },
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
            className={`px-3 py-1.5 seg-tab text-xs ${tab === t.id ? 'seg-tab-active' : ''}`}>{t.label}</button>
        ))}
      </div>

      <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800">{TENDER_TABS.find(t => t.id === tab)?.label} Tenders</h3>
        <div className="flex items-center gap-2">
          <Input icon={<Search size={14} />} placeholder="Search tenders…" value={search} onChange={e => setSearch(e.target.value)} />
          {canManageCommercial && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleSyncExternal}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition-all shrink-0 cursor-pointer shadow-2xs ${
                syncing
                  ? 'bg-amber-50 text-amber-700 border-amber-200 opacity-70 cursor-not-allowed'
                  : 'bg-white hover:bg-amber-50 text-brand-700 hover:text-brand-800 border-slate-200 hover:border-brand-300'
              }`}
              title="Sync latest live GeM / External Tenders"
            >
              <RefreshCw size={14} className={`text-brand-600 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing Tenders...' : 'Sync External Tenders'}</span>
            </button>
          )}
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
      {syncing ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-3 animate-pulse"><Search className="text-brand-400" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">Syncing tenders...</p>
        </div>
      ) : syncError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-3"><AlertTriangle className="text-red-400" size={28} /></div>
          <p className="text-sm font-bold text-red-600">⚠ {syncError}</p>
          <Button className="mt-4" onClick={handleSyncExternal}>Retry</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No manpower tenders found.</p>
          <p className="text-xs text-slate-400 mt-1">No tenders match the current view or filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Table>
              <Thead>
                <Tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <Th className="w-5/12 py-3 px-4">Tender / Organization</Th>
                  <Th className="w-2/12 py-3 px-3">Service</Th>
                  <Th className="w-2/12 py-3 px-3">Location</Th>
                  <Th className="w-1/12 py-3 px-3">Value</Th>
                  <Th className="w-1/12 py-3 px-3">Closing Date</Th>
                  <Th className="w-1/12 py-3 px-3">Status</Th>
                  <Th className="w-1/12 py-3 px-4 text-right">Action</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagedRows.map(t => (
                  <Tr
                    key={t.id}
                    onClick={() => setViewTender(t)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer border-b border-slate-100 last:border-0"
                  >
                    <Td className="py-3 px-4 align-top">
                      <div className="space-y-0.5">
                        <span className="font-mono text-[10px] font-bold text-brand-700 block tracking-tight">
                          {t.tenderNumber || t.externalId || '—'}
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-xs leading-snug break-words whitespace-normal max-w-lg">
                          {t.tenderName}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-medium leading-normal break-words whitespace-normal max-w-lg">
                          {t.clientName || '—'}
                        </p>
                      </div>
                    </Td>
                    <Td className="py-3 px-3 align-top">
                      {t.serviceType ? (
                        <Badge variant="indigo" className="text-[10px] whitespace-normal">
                          {t.serviceType}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="py-3 px-3 align-top">
                      {t.department ? (
                        <span className="inline-block text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded break-words whitespace-normal">
                          {t.department}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="py-3 px-3 align-top font-bold text-slate-800 text-xs">
                      {t.tenderValue ? `₹${Number(t.tenderValue).toLocaleString('en-IN')}` : '—'}
                    </Td>
                    <Td className="py-3 px-3 align-top text-[11px] font-medium text-slate-600">
                      {formatDate(t.endDate || t.closingDate)}
                    </Td>
                    <Td className="py-3 px-3 align-top">
                      {renderStatusBadge(t)}
                      {t.convertedContractId && (
                        <span className="block mt-1 text-[9px] font-bold text-emerald-600">✓ Contract</span>
                      )}
                    </Td>
                    <Td className="py-3 px-4 align-top text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        {renderActionCell(t)}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile Responsive Tender Cards (< 768px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {pagedRows.map(t => (
              <div
                key={t.id}
                onClick={() => setViewTender(t)}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-brand-300 transition cursor-pointer space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-mono text-[10px] font-bold text-brand-700 block">
                      {t.tenderNumber || t.externalId || '—'}
                    </span>
                    <h4 className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                      {t.tenderName}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">{t.clientName || '—'}</p>
                  </div>
                  {renderStatusBadge(t)}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
                  {t.serviceType && <Badge variant="indigo">{t.serviceType}</Badge>}
                  {t.department && (
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">
                      {t.department}
                    </span>
                  )}
                  {t.tenderValue > 0 && (
                    <span className="font-bold text-emerald-700">
                      ₹{Number(t.tenderValue).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Closing: {formatDate(t.endDate || t.closingDate)}
                  </span>
                  {renderActionCell(t)}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 mt-3 px-1 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none shadow-sm"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500 font-medium ml-2">
                  Showing {Math.min((currentPage - 1) * pageSize + 1, rows.length)}–{Math.min(currentPage * pageSize, rows.length)} of {rows.length} tenders
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition"
                  title="First Page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-3 py-1 font-bold text-slate-800 bg-slate-100 rounded-lg">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition"
                  title="Last Page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enterprise Tender Detail Modal */}
      <Modal
        open={!!viewTender}
        onClose={() => setViewTender(null)}
        title={
          <div className="flex items-center gap-2">
            <Briefcase className="text-brand-600" size={18} />
            <span className="text-base font-extrabold text-slate-900">Tender Details</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {viewTender?.sourceUrl && (
                <a
                  href={viewTender.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                >
                  <ExternalLink size={14} /> View Original Tender
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewTender && !isTenderSubmitted(viewTender) && !isTenderExpired(viewTender) && (
                <Button
                  variant="primary"
                  icon={<Send size={14} />}
                  onClick={() => {
                    const t = viewTender;
                    setViewTender(null);
                    openSubmitModal(t);
                  }}
                >
                  Submit Bid
                </Button>
              )}
              {viewTender && canManageCommercial && isTenderAwarded(viewTender) && !viewTender.convertedContractId && (
                <Button
                  icon={<ArrowRightCircle size={14} />}
                  onClick={() => {
                    const t = viewTender;
                    setViewTender(null);
                    convert(t);
                  }}
                >
                  Convert to Contract
                </Button>
              )}
              <Button variant="outline" onClick={() => setViewTender(null)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        {viewTender && (
          <div className="space-y-4 text-sm max-w-2xl">
            {/* Header Title Block */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {renderStatusBadge(viewTender)}
                {viewTender.serviceType && <Badge variant="indigo">{viewTender.serviceType}</Badge>}
                {viewTender.category && <Badge variant="amber">{viewTender.category}</Badge>}
                {viewTender.source && (
                  <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                    Source: {viewTender.source}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-snug break-words">
                {viewTender.tenderName}
              </h3>
              <p className="text-xs font-semibold text-slate-600">{viewTender.clientName || '—'}</p>
            </div>

            {/* Grid Information Block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                ['Tender Reference', viewTender.tenderNumber || viewTender.externalId || '—'],
                ['Organization / Client', viewTender.clientName || '—'],
                ['Category', viewTender.category || 'Government'],
                ['Location / Department', viewTender.department || '—'],
                ['Estimated Value', viewTender.tenderValue ? `₹${Number(viewTender.tenderValue).toLocaleString('en-IN')}` : '—'],
                ['Quoted Bid Value', viewTender.quotedValue ? `₹${Number(viewTender.quotedValue).toLocaleString('en-IN')}` : '—'],
                ['Published Date', formatDate(viewTender.publishDate || viewTender.startDate)],
                ['Closing Date', formatDate(viewTender.closingDate || viewTender.endDate)],
                ['Submission Date', formatDate(viewTender.submissionDate)],
                ['Submission Outcome', viewTender.submissionOutcome || 'Not Submitted'],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg border border-slate-100 bg-white p-3 space-y-0.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="font-extrabold text-slate-800 break-words">{v}</p>
                </div>
              ))}
            </div>

            {/* Description & Scope */}
            {(viewTender.remarks || viewTender.notes) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1 shadow-sm">
                <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Scope / Specification & Remarks
                </p>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                  {viewTender.remarks || viewTender.notes}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Tender Submission Modal */}
      <Modal
        open={!!submittingTender}
        onClose={() => setSubmittingTender(null)}
        title={
          <div className="flex items-center gap-2">
            <Send className="text-brand-600" size={18} />
            <span className="text-base font-extrabold text-slate-900">Submit Tender / Bid</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setSubmittingTender(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={bidBusy}
              onClick={handleConfirmSubmit}
              icon={<Send size={14} />}
            >
              Submit Bid
            </Button>
          </div>
        }
      >
        {submittingTender && (
          <div className="space-y-4 text-sm max-w-lg">
            {/* Tender Summary Header */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
              <span className="font-mono text-[10px] font-bold text-brand-700 block uppercase">
                {submittingTender.tenderNumber || submittingTender.externalId || 'Ref: N/A'}
              </span>
              <h3 className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                {submittingTender.tenderName}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1">
                <span>{submittingTender.clientName || 'Government / Client'}</span>
                {submittingTender.department && (
                  <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                    {submittingTender.department}
                  </span>
                )}
              </div>
            </div>

            {/* Submission Form Inputs */}
            <div className="space-y-3">
              <Input
                label="Quoted Bid Amount (₹)"
                type="number"
                placeholder="Enter bid value in INR"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
              <Textarea
                label="Proposal Cover Note / Proposal Summary"
                placeholder="Enter brief submission remarks or cover note..."
                rows={3}
                value={bidNotes}
                onChange={(e) => setBidNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Update Outcome Modal */}
      <Modal
        open={!!outcomeTender}
        onClose={() => setOutcomeTender(null)}
        title={
          <div className="flex items-center gap-2">
            <Edit2 className="text-brand-600" size={18} />
            <span className="text-base font-extrabold text-slate-900">Update Submission Outcome</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setOutcomeTender(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={outcomeBusy}
              onClick={handleSaveOutcome}
              icon={<Save size={14} />}
            >
              Save Outcome
            </Button>
          </div>
        }
      >
        {outcomeTender && (
          <div className="space-y-4 text-sm max-w-lg">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1">
              <span className="font-mono text-[10px] font-bold text-brand-700 block uppercase">
                {outcomeTender.tenderNumber || outcomeTender.externalId || 'Ref: N/A'}
              </span>
              <h3 className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                {outcomeTender.tenderName}
              </h3>
              <p className="text-xs text-slate-600">{outcomeTender.clientName || '—'}</p>
            </div>

            <Select
              label="Select Submission Outcome"
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              options={OUTCOME_OPTIONS}
            />
          </div>
        )}
      </Modal>
      </Card>
    </div>
  );
};

export default TendersTab;
