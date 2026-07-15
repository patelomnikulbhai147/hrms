// ─────────────────────────────────────────────────────────────────────────────
// Attendance MATRIX — SINGLE SHARED SCHEMA for the exported / template workbook.
//
// This "pure" module (no Excel library) is imported by BOTH the export builder
// (attendanceMatrixExport, which formats the workbook) and the importer (which
// parses it back). It owns:
//   • the standardized cell codes (P / A / HD / L / WO / H …) + the legend,
//   • the fixed employee-info + summary column definitions,
//   • the full-date header format for each report mode, and its inverse parser,
//   • matrix detection + expansion (a matrix cell → one attendance row).
//
// Because export, template and import all read this one file, the three can never
// drift apart — change a column or a code here and every file updates together.
// ─────────────────────────────────────────────────────────────────────────────

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n: number) => String(n).padStart(2, '0');

// ── Standardized status ⇄ code ────────────────────────────────────────────────
export const ATT_CODES: { code: string; status: string }[] = [
  { code: 'P',   status: 'Present' },
  { code: 'A',   status: 'Absent' },
  { code: 'HD',  status: 'Half Day' },
  { code: 'L',   status: 'Leave' },
  { code: 'WO',  status: 'Weekly Off' },
  { code: 'H',   status: 'Holiday' },
  { code: 'WFH', status: 'Work From Home' },
];
export const ATT_LEGEND = 'Legend:   P = Present    A = Absent    HD = Half Day    L = Leave    WO = Weekly Off    H = Holiday    OT = Overtime';

export const statusToCode = (status?: string): string => {
  const s = String(status || '').toLowerCase();
  if (!s) return '';
  if (s.startsWith('present')) return 'P';
  if (s.includes('half')) return 'HD';
  if (s.includes('work from home') || s === 'wfh') return 'WFH';
  if (s.includes('leave')) return 'L';
  if (s.includes('holiday')) return 'H';
  if (s.includes('weekly') || s.includes('week off') || s === 'wo') return 'WO';
  if (s.includes('absent')) return 'A';
  return '';
};
export const codeToStatus = (code?: string): string => {
  const c = String(code || '').trim().toUpperCase();
  const hit = ATT_CODES.find((x) => x.code === c);
  return hit ? hit.status : '';
};

// ── Fixed columns (single source of truth for both export & template) ─────────
export const MATRIX_INFO_COLUMNS = [
  { key: 'srNo',         header: 'Sr No',         width: 6 },
  { key: 'employeeCode', header: 'Employee Code', width: 16 },
  { key: 'biometricId',  header: 'Biometric ID',  width: 14 },
  { key: 'employeeName', header: 'Employee Name', width: 24 },
  { key: 'department',   header: 'Department',    width: 18 },
  { key: 'branch',       header: 'Branch',        width: 18 },
] as const;

export const MATRIX_SUMMARY_COLUMNS = [
  { key: 'present',     header: 'Present' },
  { key: 'absent',      header: 'Absent' },
  { key: 'half',        header: 'Half Day' },
  { key: 'leave',       header: 'Leave' },
  { key: 'weeklyOff',   header: 'Weekly Off' },
  { key: 'holiday',     header: 'Holiday' },
  { key: 'lateMarks',   header: 'Late' },
  { key: 'otHours',     header: 'Overtime' },
  { key: 'payableDays', header: 'Payable Days' },
] as const;

// ── Full-date column headers per report mode ──────────────────────────────────
const parseISO = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, js: new Date(y, m - 1, d) }; };

/**
 * Header text for a date column. Weekly / Daily / Custom show the FULL date
 * ("Mon 13 Jul 2026"); Monthly shows "01 Jul" (year is in the report header).
 */
export function formatDateHeader(mode: string, iso: string): string {
  const { y, m, d, js } = parseISO(iso);
  if (mode === 'monthly') return `${pad2(d)} ${MON[m - 1]}`;
  return `${WD[js.getDay()]} ${pad2(d)} ${MON[m - 1]} ${y}`;
}

/** Inverse of formatDateHeader — parse a date-column header back to ISO. */
export function parseDateHeader(text: string, fallbackYear?: number): string | null {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  // "Mon 13 Jul 2026" | "13 Jul 2026" | "13 Jul" | "13-Jul-2026" | "01 Jul"
  const m = t.match(/(\d{1,2})[\s\-]+([A-Za-z]{3,})\.?(?:[\s\-]+(\d{4}))?/);
  if (m) {
    const day = +m[1];
    const monIdx = MON.findIndex((x) => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
    const yr = m[3] ? +m[3] : fallbackYear;
    if (monIdx >= 0 && day >= 1 && day <= 31 && yr) return `${yr}-${pad2(monIdx + 1)}-${pad2(day)}`;
  }
  // ISO already in the header
  const iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(+iso[2])}-${pad2(+iso[3])}`;
  return null; // month-only ("Jan") → not a single day → not importable per-day
}

// ── Matrix detection + expansion (import side) ────────────────────────────────
const nk = (s: any) => String(s ?? '').toLowerCase().replace(/[\s_.\-#:]/g, '');

export interface MatrixDetection {
  headerRow: number;
  info: Record<string, number>;            // key → column index
  dateCols: { col: number; iso: string }[];
  meta: { year?: number; company?: string; branch?: string; month?: string };
}

/**
 * Detect the exported matrix in a raw AOA grid (from XLSX sheet_to_json header:1).
 * Returns null when the sheet is not our matrix (e.g. a flat biometric export) so
 * the importer can fall back to its device/flat parser.
 */
export function detectMatrix(aoa: any[][]): MatrixDetection | null {
  if (!aoa || !aoa.length) return null;
  const meta: MatrixDetection['meta'] = {};
  const labelOnRow = (row: any[], label: string): string => {
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '');
      const mm = cell.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'));
      if (mm && mm[1].trim()) return mm[1].trim();
      if (nk(cell) === nk(label)) { const nxt = String(row[c + 1] ?? '').replace(/^:\s*/, '').trim(); if (nxt) return nxt; }
    }
    return '';
  };

  let headerRow = -1;
  const scan = Math.min(aoa.length, 40);
  for (let r = 0; r < scan; r++) {
    const row = aoa[r] || [];
    if (!meta.company) { const v = labelOnRow(row, 'company'); if (v) meta.company = v; }
    if (!meta.branch) { const v = labelOnRow(row, 'branch'); if (v) meta.branch = v; }
    if (!meta.month) { const v = labelOnRow(row, 'month'); if (v) meta.month = v; }
    if (headerRow < 0) {
      const hasCode = row.some((c) => nk(c) === 'employeecode');
      const hasSr = row.some((c) => nk(c) === 'srno');
      if (hasCode || (hasSr && row.some((c) => nk(c).includes('employee')))) headerRow = r;
    }
  }
  if (headerRow < 0) return null;

  const yrMatch = `${meta.month || ''}`.match(/(\d{4})/);
  const year = yrMatch ? +yrMatch[1] : undefined;

  const header = aoa[headerRow] || [];
  const info: Record<string, number> = {};
  const setInfo = (key: string, ...aliases: string[]) => {
    const idx = header.findIndex((c) => aliases.includes(nk(c)));
    if (idx >= 0) info[key] = idx;
  };
  setInfo('srNo', 'srno', 'sno', 'serialno');
  setInfo('employeeCode', 'employeecode', 'empcode', 'employeeid', 'code');
  setInfo('biometricId', 'biometricid', 'bioid', 'deviceid');
  setInfo('employeeName', 'employeename', 'name', 'empname');
  setInfo('department', 'department', 'dept');
  setInfo('branch', 'branch', 'branchname');

  const infoIdxs = new Set(Object.values(info));
  const summaryHeaders = new Set(MATRIX_SUMMARY_COLUMNS.map((s) => nk(s.header)));
  const dateCols: { col: number; iso: string }[] = [];
  for (let c = 0; c < header.length; c++) {
    if (infoIdxs.has(c)) continue;
    if (summaryHeaders.has(nk(header[c]))) continue; // skip summary columns
    const iso = parseDateHeader(String(header[c] ?? ''), year);
    if (iso) dateCols.push({ col: c, iso });
  }
  if ((info.employeeCode == null && info.biometricId == null) || !dateCols.length) return null;
  return { headerRow, info, dateCols, meta: { ...meta, year } };
}

export interface ExpandedRow { rowNo: number; employeeKey: string; altKey?: string; date: string; status: string; }

/** Expand a detected matrix into one row per (employee, date-with-a-value). */
export function expandMatrix(aoa: any[][], det: MatrixDetection): ExpandedRow[] {
  const out: ExpandedRow[] = [];
  const cell = (row: any[], idx?: number) => (idx != null ? String(row[idx] ?? '').trim() : '');
  for (let r = det.headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const code = cell(row, det.info.employeeCode);
    const bio = cell(row, det.info.biometricId);
    if (!code && !bio) continue; // legend / blank / footer rows
    const ids = [bio, code].filter(Boolean);
    const employeeKey = ids[0];
    const altKey = ids.find((x) => x !== employeeKey);
    for (const dc of det.dateCols) {
      const raw = String(row[dc.col] ?? '').trim();
      if (!raw) continue;
      const status = codeToStatus(raw) || (/^[A-Za-z ]+$/.test(raw) ? raw : '');
      if (!status) continue;
      out.push({ rowNo: r + 1, employeeKey, altKey, date: dc.iso, status });
    }
  }
  return out;
}
