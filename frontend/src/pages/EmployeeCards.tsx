import React, { useMemo, useRef, useState } from 'react';
import { IdCard, Search, Download, Printer, Layers, Sparkles, QrCode } from 'lucide-react';
import type { Role, Company, Employee } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/context/PermissionContext';
import { EmployeeIdCard, EmployeeInfoCard } from '@/components/cards/EmployeeCardTemplates';
import { renderNodeToPdf, downloadCardsPdf } from '@/utils/employeeCardGenerator';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { ui } from '@/components/ui/feedback';

interface EmployeeCardsProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  employees: Employee[];
}

type CardType = 'id' | 'info';

export const EmployeeCards: React.FC<EmployeeCardsProps> = ({ activeCompanyId, companies, employees }) => {
  const { canView } = usePermissions();
  const [cardType, setCardType] = useState<CardType>('id');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  // Resolve the active workspace company. If you entered via a BRANCH, roll up
  // to its parent so the card section covers the whole company (all branches).
  const company = useMemo(
    () => companies.find(c => String(c.id) === String(activeCompanyId)) || companies[0],
    [companies, activeCompanyId]
  );
  const rootCompany = useMemo(
    () => (company?.parentCompanyId
      ? companies.find(c => String(c.id) === String(company.parentCompanyId)) : company) || company,
    [companies, company]
  );
  const brand = rootCompany || company; // fallback branding only (when an employee's company can't be resolved)

  // Every company id that belongs to the active company tree: the root company
  // plus all of its branches. ID Cards must be available for every employee in
  // EVERY branch, so scoping is by the whole tree — not the single workspace.
  const treeIds = useMemo(() => {
    const root = rootCompany || company;
    const set = new Set<string>();
    if (root) set.add(String(root.id));
    companies.forEach(c => { if (root && String(c.parentCompanyId) === String(root.id)) set.add(String(c.id)); });
    return set;
  }, [companies, rootCompany, company]);

  // Branch / company names in the tree — for employees that carry a
  // branchLocation string instead of a branch companyId.
  const treeBranchNames = useMemo(() => {
    const s = new Set<string>();
    companies.forEach(c => {
      if (!treeIds.has(String(c.id))) return;
      if (c.branchName) s.add(c.branchName.toUpperCase().trim());
      if (c.name) s.add(c.name.toUpperCase().trim());
    });
    return s;
  }, [companies, treeIds]);

  const belongsToTree = (e: Employee) => {
    if (e.companyId != null && treeIds.has(String(e.companyId))) return true;
    if ((e as any).branchId != null && treeIds.has(String((e as any).branchId))) return true;
    const bl = (e.branchLocation || '').toUpperCase().trim();
    return !!bl && treeBranchNames.has(bl);
  };

  // Resolve branding (name / logo / colour) for an INDIVIDUAL employee from
  // their OWN company record — never the logged-in workspace. This is what makes
  // each card show the employee's real company instead of one hardcoded name.
  const resolveBrand = (e: Employee): Company => {
    const own = companies.find(c => String(c.id) === String(e.companyId))
      || ((e as any).branchId ? companies.find(c => String(c.id) === String((e as any).branchId)) : undefined);
    if (!own) return brand as Company;
    return own.parentCompanyId
      ? (companies.find(c => String(c.id) === String(own.parentCompanyId)) || own)
      : own;
  };

  // Active employees across the whole company tree (all branches).
  const scoped = useMemo(
    () => (employees || []).filter(e => isActiveEmployee(e) && belongsToTree(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, treeIds, treeBranchNames]
  );

  const departments = useMemo(
    () => Array.from(new Set(scoped.map(e => e.department).filter(Boolean))).sort(),
    [scoped]
  );

  const filtered = useMemo(() => scoped.filter(e => {
    if (deptFilter && e.department !== deptFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name || '').toLowerCase().includes(q)
      || (e.employeeId || '').toLowerCase().includes(q)
      || (e.designation || '').toLowerCase().includes(q);
  }), [scoped, deptFilter, search]);

  const selected = useMemo(
    () => scoped.find(e => String(e.id) === String(selectedId)) || filtered[0] || scoped[0],
    [scoped, filtered, selectedId]
  );

  if (!canView('employees')) {
    return <Card><div className="py-12 text-center text-sm text-slate-500">You do not have permission to view Employee Cards.</div></Card>;
  }

  const fileSafe = (s: string) => (s || 'employee').replace(/[^a-z0-9]+/gi, '_');

  const handleDownload = async () => {
    if (!selected || !previewRef.current) return;
    setBusy('download');
    try {
      await renderNodeToPdf(previewRef.current, `${fileSafe(selected.employeeId)}_${cardType === 'id' ? 'ID' : 'Info'}_Card.pdf`);
    } catch (e: any) {
      ui.toast.error(`Failed to generate card: ${e?.message || 'error'}`);
    } finally { setBusy(null); }
  };

  const handlePrint = async () => {
    if (!previewRef.current) return;
    setBusy('print');
    try {
      const html = previewRef.current.innerHTML;
      const w = window.open('', '_blank', 'width=900,height=650');
      if (!w) { ui.toast.warning('Pop-up blocked. Allow pop-ups to print.'); return; }
      w.document.write(`<html><head><title>Employee Card</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body style="display:flex;align-items:center;justify-content:center;padding:24px;">${html}</body></html>`);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 600);
    } finally { setBusy(null); }
  };

  const handleBulk = async () => {
    const targets = bulkIds.length
      ? scoped.filter(e => bulkIds.includes(String(e.id)))
      : filtered;
    if (targets.length === 0) { ui.toast.warning('No employees selected for bulk generation.'); return; }
    setBusy('bulk');
    try {
      await downloadCardsPdf(targets, resolveBrand, cardType, `Employee_${cardType === 'id' ? 'ID' : 'Info'}_Cards.pdf`);
    } catch (e: any) {
      ui.toast.error(`Bulk generation failed: ${e?.message || 'error'}`);
    } finally { setBusy(null); }
  };

  const toggleBulk = (id: string) =>
    setBulkIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#DBEAFE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600"><IdCard size={20} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Employee Cards
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
                  <Sparkles size={10} /> Upcoming Enterprise Feature
                </span>
              </h2>
              <p className="text-xs text-slate-500">Generate branded Employee ID Cards and Information Cards — preview, print, download &amp; bulk export.</p>
            </div>
          </div>
          <Badge variant="indigo">{scoped.length} employees</Badge>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button onClick={() => setCardType('id')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${cardType === 'id' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
              ID Card
            </button>
            <button onClick={() => setCardType('info')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${cardType === 'info' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
              Information Card
            </button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" icon={<Printer size={13} />} loading={busy === 'print'} onClick={handlePrint} disabled={!selected}>Print</Button>
            <Button size="sm" variant="outline" icon={<Download size={13} />} loading={busy === 'download'} onClick={handleDownload} disabled={!selected}>Download PDF</Button>
            <Button size="sm" icon={<Layers size={13} />} loading={busy === 'bulk'} onClick={handleBulk}>
              Bulk Generate {bulkIds.length ? `(${bulkIds.length})` : `(${filtered.length})`}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Employee list */}
        <Card className="lg:col-span-1">
          <div className="space-y-2 mb-3">
            <Input icon={<Search size={14} />} placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              options={[{ value: '', label: 'All departments' }, ...departments.map(d => ({ value: d, label: d }))]} />
          </div>
          <div className="max-h-[520px] overflow-y-auto space-y-1">
            {filtered.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No employees match.</p>}
            {filtered.map(e => {
              const id = String(e.id);
              const isSel = String(selected?.id) === id;
              return (
                <div key={id}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${isSel ? 'bg-indigo-50 border-indigo-200' : 'border-transparent hover:bg-slate-50'}`}
                  onClick={() => setSelectedId(id)}>
                  <input type="checkbox" checked={bulkIds.includes(id)} onClick={ev => ev.stopPropagation()} onChange={() => toggleBulk(id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{e.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{e.employeeId} · {e.designation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Preview */}
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
            <QrCode size={14} className="text-indigo-600" />
            Live preview — {cardType === 'id' ? 'Employee ID Card (front &amp; back)' : 'Employee Information Card'}
          </div>
          {!selected ? (
            <div className="py-16 text-center text-sm text-slate-400">Select an employee to preview their card.</div>
          ) : (
            <div className="flex flex-wrap items-start justify-center gap-6 py-4 bg-slate-50 rounded-xl">
              <div ref={previewRef}>
                {cardType === 'id'
                  ? <EmployeeIdCard employee={selected} company={resolveBrand(selected)} />
                  : <EmployeeInfoCard employee={selected} company={resolveBrand(selected)} />}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default EmployeeCards;
