import React, { useMemo, useState } from 'react';
import {
  FileText, FileSpreadsheet, FileType, Archive, Eye, Download,
  Calendar, ListFilter, Layers, SlidersHorizontal, CheckSquare, Square, Building2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import {
  type ExportColumn, type ReportMeta, type ReportAttachment,
  exportReportPdf, exportReportExcel, exportReportCsv, exportReportZip,
} from '@/utils/exportUtils';

/* ============================================================================
 * REUSABLE MASTER EXPORT WIZARD
 * A single, professional "Export …" dialog driven entirely by config, so the
 * same UI can be dropped into Employees / Attendance / Payroll / Leave / Assets /
 * Branches / Company Profile / Communication. Only the config changes; the UI,
 * filtering, preview and export pipeline stay identical everywhere.
 * ==========================================================================*/

export type ExportStatusBucket = 'Active' | 'Expiring' | 'Expired' | 'Missing';

export interface ExportReportType {
  id: string;
  label: string;
  columns: ExportColumn[];
  /** Optional base filter that *defines* this report (e.g. only expired rows). */
  baseFilter?: (row: any) => boolean;
}

export interface ExportSortOption { id: string; label: string; }

export interface ExportWizardConfig {
  /** Modal title. Default: `Export ${entityName}`. */
  title?: string;
  /** Human name of the dataset, e.g. "Company Documents". */
  entityName: string;
  reportTypes: ExportReportType[];
  /** Full, already permission/company-scoped dataset (flat rows). */
  rows: any[];
  /** Rows the user has selected on screen (for the "Selected" scope). */
  selectedRows?: any[];
  categories?: { id: string; label: string }[];
  categoryOf?: (row: any) => string;
  /** Row → status bucket. Omit to hide the status filter. */
  statusOf?: (row: any) => ExportStatusBucket | string;
  dateAccessors?: {
    issue?: (row: any) => string | undefined;
    expiry?: (row: any) => string | undefined;
    uploaded?: (row: any) => string | undefined;
  };
  /** Comparable value per sort option id. */
  sortAccessors?: Record<string, (row: any) => any>;
  sortOptions?: ExportSortOption[];
  /** Row → uploaded file (for Include Attachments / ZIP / hyperlinks). */
  attachmentOf?: (row: any) => ReportAttachment | null;
  company?: any;
  /** Company logo data URL (for branded headers). */
  companyLogo?: string;
  generatedBy?: string;
}

interface Props { open: boolean; onClose: () => void; config: ExportWizardConfig; }

const STATUS_BUCKETS: ExportStatusBucket[] = ['Active', 'Expiring', 'Expired', 'Missing'];
const DEFAULT_SORTS: ExportSortOption[] = [
  { id: 'name', label: 'Document Name' }, { id: 'category', label: 'Category' },
  { id: 'expiry', label: 'Expiry Date' }, { id: 'issue', label: 'Issue Date' }, { id: 'upload', label: 'Upload Date' },
];

// ── Light-themed local controls (match the white dialog) ──────────────────────
const selCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#C77E52] transition-colors';
const inpCls = selCls;
const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }> = ({ icon, title, children, className }) => (
  <div className={className}>
    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">{icon}{title}</div>
    {children}
  </div>
);
const Chk: React.FC<{ checked: boolean; onChange: () => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button type="button" onClick={onChange} disabled={disabled}
    className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${disabled ? 'text-slate-300 cursor-not-allowed' : checked ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
    {checked ? <CheckSquare size={15} className="text-[#C77E52]" /> : <Square size={15} className="text-slate-300" />}{label}
  </button>
);
const Radio: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${active ? 'bg-[#FCF4EE] border-[#C77E52] text-[#C77E52]' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{label}</button>
);

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: <FileText size={16} /> },
  { id: 'excel', label: 'Excel', icon: <FileSpreadsheet size={16} /> },
  { id: 'csv', label: 'CSV', icon: <FileType size={16} /> },
  { id: 'zip', label: 'ZIP', icon: <Archive size={16} /> },
] as const;
type FormatId = typeof FORMATS[number]['id'];

export const ExportWizard: React.FC<Props> = ({ open, onClose, config }) => {
  const sortOptions = config.sortOptions || DEFAULT_SORTS;
  const [reportTypeId, setReportTypeId] = useState(config.reportTypes[0]?.id || '');
  const [scope, setScope] = useState<'all' | 'selected' | 'categories'>('all');
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [dateField, setDateField] = useState<'all' | 'issue' | 'expiry' | 'uploaded'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statuses, setStatuses] = useState<Set<string>>(new Set(STATUS_BUCKETS));
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [format, setFormat] = useState<FormatId>('pdf');
  const [pdf, setPdf] = useState({ pageSize: 'a4' as 'a4' | 'legal' | 'letter', orientation: 'portrait' as 'portrait' | 'landscape', logo: true, header: true, footer: true, pageNumbers: true, watermark: false, docPreview: false });
  const [excel, setExcel] = useState({ autoFit: true, freezeHeader: true, autoFilter: true, hyperlinks: false, branding: true });
  const [sortBy, setSortBy] = useState(sortOptions[0]?.id || 'name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [previewMode, setPreviewMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const reportType = config.reportTypes.find(r => r.id === reportTypeId) || config.reportTypes[0];
  const hasStatus = !!config.statusOf;
  const hasCategories = !!(config.categories?.length && config.categoryOf);
  const hasSelected = !!(config.selectedRows && config.selectedRows.length);

  const inRange = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr); if (isNaN(d.getTime())) return false;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo) { const to = new Date(dateTo); to.setHours(23, 59, 59, 999); if (d > to) return false; }
    return true;
  };

  // Final rows after scope → report type → category → status → date → sort.
  const rows = useMemo(() => {
    let list = scope === 'selected' ? (config.selectedRows || []) : config.rows;
    if (reportType?.baseFilter) list = list.filter(reportType.baseFilter);
    if (scope === 'categories' && config.categoryOf) list = list.filter(r => selectedCats.has(config.categoryOf!(r)));
    if (hasStatus && statuses.size && statuses.size < STATUS_BUCKETS.length) list = list.filter(r => statuses.has(String(config.statusOf!(r))));
    if (dateField !== 'all' && (dateFrom || dateTo)) {
      const acc = config.dateAccessors?.[dateField];
      if (acc) list = list.filter(r => inRange(acc(r)));
    }
    const acc = config.sortAccessors?.[sortBy];
    if (acc) {
      list = [...list].sort((a, b) => {
        const av = acc(a), bv = acc(b);
        const an = av == null ? '' : av, bn = bv == null ? '' : bv;
        const cmp = an < bn ? -1 : an > bn ? 1 : 0;
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [config, scope, selectedCats, reportType, statuses, dateField, dateFrom, dateTo, sortBy, sortOrder, hasStatus]);

  const columns = reportType?.columns || [];
  const catCount = useMemo(() => config.categoryOf ? new Set(rows.map(r => config.categoryOf!(r))).size : 0, [rows, config]);
  const attachCount = useMemo(() => config.attachmentOf ? rows.filter(r => config.attachmentOf!(r)?.fileData).length : 0, [rows, config]);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    set(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const buildMeta = (): ReportMeta => ({
    title: reportType?.label || 'Report',
    companyName: config.company?.name || config.company?.companyName || 'Company',
    companyLogo: pdf.logo ? config.companyLogo : undefined,
    companyLine: [config.company?.city, config.company?.state].filter(Boolean).join(', ') || undefined,
    generatedBy: config.generatedBy,
    subtitle: `Report: ${reportType?.label} · Scope: ${scope === 'all' ? 'All' : scope === 'selected' ? 'Selected' : 'Categories'}${hasStatus && statuses.size < STATUS_BUCKETS.length ? ` · Status: ${[...statuses].join(', ')}` : ''}`,
  });

  const attachmentsFor = () => config.attachmentOf ? rows.map(r => config.attachmentOf!(r)) : rows.map(() => null);
  const fileBase = `${config.company?.name || config.entityName}_${reportType?.label || 'Report'}`;

  const doExport = async () => {
    if (!rows.length) { ui.toast.info('No documents match the selected filters.'); return; }
    setBusy(true);
    try {
      const meta = buildMeta();
      const atts = attachmentsFor();
      const pdfOpts = { ...pdf };
      if (format === 'pdf') {
        exportReportPdf(fileBase, meta, columns, rows, pdfOpts, includeAttachments && pdf.docPreview ? atts.filter(Boolean) as ReportAttachment[] : undefined);
      } else if (format === 'excel') {
        exportReportExcel(fileBase, meta, columns, rows, excel, includeAttachments ? atts : undefined);
      } else if (format === 'csv') {
        exportReportCsv(fileBase, columns, rows);
      } else if (format === 'zip') {
        await exportReportZip(fileBase, meta, columns, rows, includeAttachments ? atts : [], pdfOpts, excel);
      }
      ui.toast.success(`Export ready — ${rows.length} record${rows.length === 1 ? '' : 's'} (${format.toUpperCase()}).`);
      onClose();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Export failed. Please try again.');
    } finally { setBusy(false); }
  };

  const showPdfOpts = format === 'pdf' || format === 'zip';
  const showExcelOpts = format === 'excel' || format === 'zip';

  const footer = previewMode ? (
    <>
      <Button variant="outline" onClick={() => setPreviewMode(false)}>Back</Button>
      <Button icon={<Download size={14} />} onClick={doExport} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button variant="outline" icon={<Eye size={14} />} onClick={() => setPreviewMode(true)}>Preview</Button>
      <Button icon={<Download size={14} />} onClick={doExport} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={config.title || `Export ${config.entityName}`} size="xl" footer={footer}>
      {previewMode ? (
        <PreviewPane meta={buildMeta()} columns={columns} rows={rows} format={format} attachments={includeAttachments} attachCount={attachCount} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left: report definition + filters ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Section icon={<FileText size={13} />} title="Report Type">
                <select className={selCls} value={reportTypeId} onChange={e => setReportTypeId(e.target.value)}>
                  {config.reportTypes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Section>
              <Section icon={<ListFilter size={13} />} title="Sorting">
                <div className="flex gap-2">
                  <select className={selCls} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    {sortOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <select className={`${selCls} w-28`} value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}>
                    <option value="asc">Ascending</option><option value="desc">Descending</option>
                  </select>
                </div>
              </Section>
            </div>

            <Section icon={<Layers size={13} />} title="Export Scope">
              <div className="flex flex-wrap gap-2">
                <Radio active={scope === 'all'} onClick={() => setScope('all')} label="All Documents" />
                <Radio active={scope === 'selected'} onClick={() => hasSelected ? setScope('selected') : ui.toast.info('No documents are selected on screen.')} label={`Selected${hasSelected ? ` (${config.selectedRows!.length})` : ''}`} />
                {hasCategories && <Radio active={scope === 'categories'} onClick={() => setScope('categories')} label="Selected Categories" />}
              </div>
              {scope === 'categories' && hasCategories && (
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  {config.categories!.map(c => (
                    <Chk key={c.id} checked={selectedCats.has(c.id)} onChange={() => toggle(setSelectedCats, c.id)} label={c.label} />
                  ))}
                </div>
              )}
            </Section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Section icon={<Calendar size={13} />} title="Date Filter">
                <select className={selCls} value={dateField} onChange={e => setDateField(e.target.value as any)}>
                  <option value="all">All Dates</option>
                  {config.dateAccessors?.issue && <option value="issue">Issue Date Range</option>}
                  {config.dateAccessors?.expiry && <option value="expiry">Expiry Date Range</option>}
                  {config.dateAccessors?.uploaded && <option value="uploaded">Uploaded Date Range</option>}
                </select>
                {dateField !== 'all' && (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="date" className={inpCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span className="text-[11px] text-slate-400 font-bold">to</span>
                    <input type="date" className={inpCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                )}
              </Section>

              {hasStatus && (
                <Section icon={<ListFilter size={13} />} title="Document Status">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {STATUS_BUCKETS.map(s => <Chk key={s} checked={statuses.has(s)} onChange={() => toggle(setStatuses, s)} label={s} />)}
                  </div>
                </Section>
              )}
            </div>

            {config.attachmentOf && (
              <Section icon={<Archive size={13} />} title="Attachments">
                <Chk checked={includeAttachments} onChange={() => setIncludeAttachments(v => !v)} label="Include Uploaded Documents" />
                {includeAttachments && (
                  <p className="mt-1 text-[10.5px] text-slate-400 leading-relaxed">
                    {format === 'zip' ? 'Uploaded files are bundled in a /documents folder alongside the report.'
                      : format === 'pdf' ? 'Enable “Document Preview” below to append image files as pages. Use ZIP to include all file types.'
                      : format === 'excel' ? 'A “Document” column with file names (and links where available) is added.'
                      : 'Files can only be bundled with the ZIP format.'}
                  </p>
                )}
              </Section>
            )}
          </div>

          {/* ── Right: format + options + summary ─────────────────────────── */}
          <div className="space-y-5">
            <Section icon={<Download size={13} />} title="Export Format">
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map(f => (
                  <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors ${format === f.id ? 'bg-[#FCF4EE] border-[#C77E52] text-[#C77E52]' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    {f.icon}{f.label}
                  </button>
                ))}
              </div>
            </Section>

            {showPdfOpts && (
              <Section icon={<SlidersHorizontal size={13} />} title="PDF Options">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(['a4', 'legal', 'letter'] as const).map(sz => <Radio key={sz} active={pdf.pageSize === sz} onClick={() => setPdf({ ...pdf, pageSize: sz })} label={sz === 'a4' ? 'A4' : sz[0].toUpperCase() + sz.slice(1)} />)}
                  {(['portrait', 'landscape'] as const).map(o => <Radio key={o} active={pdf.orientation === o} onClick={() => setPdf({ ...pdf, orientation: o })} label={o[0].toUpperCase() + o.slice(1)} />)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Chk checked={pdf.logo} onChange={() => setPdf({ ...pdf, logo: !pdf.logo })} label="Company Logo" />
                  <Chk checked={pdf.header} onChange={() => setPdf({ ...pdf, header: !pdf.header })} label="Company Header" />
                  <Chk checked={pdf.footer} onChange={() => setPdf({ ...pdf, footer: !pdf.footer })} label="Company Footer" />
                  <Chk checked={pdf.pageNumbers} onChange={() => setPdf({ ...pdf, pageNumbers: !pdf.pageNumbers })} label="Page Numbers" />
                  <Chk checked={pdf.watermark} onChange={() => setPdf({ ...pdf, watermark: !pdf.watermark })} label="Watermark" />
                  <Chk checked={pdf.docPreview} onChange={() => setPdf({ ...pdf, docPreview: !pdf.docPreview })} label="Document Preview" disabled={!includeAttachments} />
                </div>
              </Section>
            )}

            {showExcelOpts && (
              <Section icon={<SlidersHorizontal size={13} />} title="Excel Options">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Chk checked={excel.autoFit} onChange={() => setExcel({ ...excel, autoFit: !excel.autoFit })} label="Auto-fit Columns" />
                  <Chk checked={excel.freezeHeader} onChange={() => setExcel({ ...excel, freezeHeader: !excel.freezeHeader })} label="Freeze Header" />
                  <Chk checked={excel.autoFilter} onChange={() => setExcel({ ...excel, autoFilter: !excel.autoFilter })} label="Apply Filters" />
                  <Chk checked={excel.hyperlinks} onChange={() => setExcel({ ...excel, hyperlinks: !excel.hyperlinks })} label="Doc Links" />
                  <Chk checked={excel.branding} onChange={() => setExcel({ ...excel, branding: !excel.branding })} label="Company Branding" />
                </div>
              </Section>
            )}

            {/* Summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1"><Building2 size={13} />Export Summary</div>
              <SummaryRow label="Documents Found" value={<span className="font-extrabold text-slate-800">{rows.length}</span>} />
              {config.categoryOf && <SummaryRow label="Categories" value={String(catCount)} />}
              {hasStatus && <SummaryRow label="Status" value={statuses.size === STATUS_BUCKETS.length ? 'All' : ([...statuses].join(', ') || 'None')} />}
              {config.attachmentOf && <SummaryRow label="Attachments" value={includeAttachments ? `Included (${attachCount})` : 'Not included'} />}
              <SummaryRow label="Format" value={<span className="uppercase font-bold text-[#C77E52]">{format}</span>} />
              <div className="pt-1.5 mt-1 border-t border-slate-200 text-[10.5px] text-slate-400 leading-relaxed">
                Generated by <span className="font-semibold text-slate-500">{config.generatedBy || '—'}</span> · {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs"><span className="text-slate-500 font-semibold">{label}</span><span className="text-slate-700">{value}</span></div>
);

// ── Preview (renders the report on-screen without downloading) ────────────────
const PreviewPane: React.FC<{ meta: ReportMeta; columns: ExportColumn[]; rows: any[]; format: string; attachments: boolean; attachCount: number }> = ({ meta, columns, rows, format, attachments, attachCount }) => {
  const shown = rows.slice(0, 50);
  const resolve = (col: ExportColumn, row: any) => {
    const raw = col.key.split('.').reduce((o: any, k) => (o == null ? o : o[k]), row);
    const v = col.format ? col.format(raw, row) : raw;
    return v == null || v === '' ? '—' : String(v);
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b-2 border-[#C77E52] pb-3 mb-3">
        <div className="flex items-center gap-3">
          {meta.companyLogo && <img src={meta.companyLogo} alt="" className="h-11 w-11 object-contain rounded" />}
          <div>
            <div className="text-base font-extrabold text-slate-800">{meta.companyName}</div>
            <div className="text-sm font-bold text-[#C77E52]">{meta.title}</div>
            {meta.companyLine && <div className="text-[11px] text-slate-400">{meta.companyLine}</div>}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-400 leading-relaxed">
          <div>Generated: {new Date().toLocaleString()}</div>
          {meta.generatedBy && <div>Generated By: {meta.generatedBy}</div>}
          <div>Records: {rows.length}{attachments ? ` · Attachments: ${attachCount}` : ''} · {format.toUpperCase()}</div>
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200 max-h-[52vh]">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#C77E52] text-white">{columns.map(c => <th key={c.key} className="text-left font-bold px-2.5 py-2 whitespace-nowrap">{c.header}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={columns.length} className="text-center text-slate-400 py-8">No documents match the selected filters.</td></tr>}
            {shown.map((row, i) => (
              <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                {columns.map(c => <td key={c.key} className="px-2.5 py-1.5 text-slate-600 border-t border-slate-100 whitespace-nowrap max-w-[220px] truncate">{resolve(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && <p className="text-[11px] text-slate-400 mt-2">Showing first {shown.length} of {rows.length} records. The exported file includes all records.</p>}
    </div>
  );
};

export default ExportWizard;
