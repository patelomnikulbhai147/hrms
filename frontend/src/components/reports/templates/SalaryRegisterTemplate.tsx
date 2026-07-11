import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';
import { t as translate } from '../../../utils/reportTranslations';
import { DEDUCTION_COMPONENTS, deductionMap } from '@/utils/deductionBreakdown';

// ── SALARY REGISTER ──────────────────────────────────────────────────────────
const cell: React.CSSProperties = { border: '1px solid #333', padding: '4px 6px', fontSize: 11 };
const th: React.CSSProperties = { ...cell, background: '#eef2ff', fontWeight: 700, textAlign: 'center' };
const num: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
// Deduction split columns are narrower and tinted so the register still reads as
// one table rather than two.
const dedTh: React.CSSProperties = { ...th, background: '#fef2f2', fontSize: 9, padding: '4px 3px', width: 62 };
const dedNum: React.CSSProperties = { ...num, fontSize: 10, padding: '4px 3px', color: '#7f1d1d' };

/** Short header labels — the full names are too wide for a landscape register. */
const SHORT: Record<string, string> = {
  pf: 'PF', eps: 'EPS', vpf: 'VPF', esi: 'ESIC', professionalTax: 'PT', lwf: 'LWF',
  tds: 'TDS', loanRecovery: 'Loan', advanceRecovery: 'Advance', insurance: 'Insurance',
  otherDeductions: 'Other',
};

export const SalaryRegisterTemplate: React.FC<TemplateProps> = ({ data, lang = 'en' }) => {
  const t = (txt: string) => translate(txt, lang);
  const m = data.meta;
  const rows = data.rows || [];
  const period = data.filters?.period || (rows[0]?.month ? `${rows[0].month} ${rows[0].year || ''}`.trim() : (rows[0]?.period || '—'));
  const sum = (k: string) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);

  // Per-employee deduction split, from the same engine the payslip uses, so a
  // register column and a slip line can never disagree. The report row names the
  // basic wage `basic`; the engine expects a payroll-shaped record.
  const splits = React.useMemo(
    () => rows.map((r: any) => deductionMap(
      { basicSalary: r.basic, deductions: r.deductions, tax: r.tax, loanDeduction: r.loanDeduction },
      (m as any)?.rates,
    )),
    [rows, m],
  );
  // Only render a column when some employee actually has that deduction —
  // an all-zero column is noise (and the same rule the slip applies to rows).
  const activeCols = React.useMemo(
    () => DEDUCTION_COMPONENTS.filter(c => splits.some(s => (s[c.key] || 0) > 0)),
    [splits],
  );
  const colTotal = (key: string) => splits.reduce((t, s) => t + (s[key] || 0), 0);
  // Sr, Emp ID, Name, Dept, Period, Basic, Allowances, Bonus, …splits, Total Ded, Tax, Net
  const colCount = 11 + activeCols.length;

  return (
    <div style={{ width: 1040, margin: '0 auto', background: '#fff', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif', padding: 18 }}>
      {/* Company header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>{m?.name || 'Company'}</div>
        {m?.branchName && <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginTop: 1 }}>{m.branchName}</div>}
        {m?.address && <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>{m.address}</div>}
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
          {m?.panNumber && <span>PAN: {m.panNumber}&nbsp;&nbsp;</span>}
          {m?.gstNumber && <span>GSTIN: {m.gstNumber}</span>}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, margin: '6px 0 10px', textTransform: 'uppercase' }}>
        {t('Salary Register')} &nbsp;—&nbsp; {period}
      </div>

      <table data-recalc-scope="salary_register" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 34 }}>{t('Sr')}</th>
            <th style={{ ...th, width: 80 }}>{t('Emp ID')}</th>
            <th style={{ ...th, textAlign: 'left' }}>{t('Employee Name')}</th>
            <th style={{ ...th, width: 120 }}>{t('Department')}</th>
            <th style={{ ...th, width: 90 }}>{t('Period')}</th>
            <th style={th}>{t('Basic')}</th>
            <th style={th}>{t('Allowances')}</th>
            <th style={th}>{t('Bonus')}</th>
            {/* One column per deduction that at least one employee actually has. */}
            {activeCols.map(c => (
              <th key={c.key} style={dedTh} title={c.label}>{t(SHORT[c.key] || c.label)}</th>
            ))}
            <th style={th}>{t('Total Deduction')}</th>
            <th style={th}>{t('Tax')}</th>
            <th style={th}>{t('Net Pay')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // data-row makes this <tr> a record boundary: editing Basic/Allowances/
            // Bonus/Deductions/Tax re-derives Net for THIS employee (and the grand
            // totals below), spreadsheet-style — see reportRecalc.ts.
            <tr key={i} data-row>
              <td style={{ ...cell, textAlign: 'center' }}>{r.sr ?? i + 1}</td>
              <td style={{ ...cell, fontFamily: 'monospace' }}>{r.code || '—'}</td>
              <td style={cell}>{r.name}</td>
              <td style={cell}>{r.department || '—'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{r.month ? `${r.month} ${r.year || ''}`.trim() : (r.period || period)}</td>
              <td style={num} data-cell="basic">{inr(r.basic)}</td>
              <td style={num} data-cell="allowances">{inr(r.allowances)}</td>
              <td style={num} data-cell="bonus">{inr(r.bonus)}</td>
              {/* Read-only split. Deliberately untagged (no data-cell): the
                  recalc engine must keep treating `deductions` as the single
                  editable deduction source, exactly as before. */}
              {activeCols.map(c => {
                const v = splits[i]?.[c.key] || 0;
                return <td key={c.key} style={dedNum}>{v > 0 ? inr(v) : '—'}</td>;
              })}
              <td style={num} data-cell="deductions">{inr(r.deductions)}</td>
              <td style={num} data-cell="tax">{inr(r.tax)}</td>
              {/* Net = (Basic + Allowances + Bonus) − (Deductions + Tax). Derived &
                  read-only; the baseline-offset keeps the loaded value exact. */}
              <td style={{ ...num, fontWeight: 700 }} data-cell="net" data-formula="basic + allowances + bonus - deductions - tax" data-nonneg>{inr(r.net)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td style={{ ...cell, textAlign: 'center', padding: 16 }} colSpan={colCount}>{t('No salary records for the selected period.')}</td></tr>
          )}
          {rows.length > 0 && (
            <tr>
              <td style={{ ...th, textAlign: 'right' }} colSpan={5}>{t('GRAND TOTAL')} ({rows.length} {t('employees')})</td>
              <td style={{ ...num, ...th }} data-total="basic">{inr(sum('basic'))}</td>
              <td style={{ ...num, ...th }} data-total="allowances">{inr(sum('allowances'))}</td>
              <td style={{ ...num, ...th }} data-total="bonus">{inr(sum('bonus'))}</td>
              {activeCols.map(c => (
                <td key={c.key} style={{ ...dedNum, ...dedTh, textAlign: 'right' }}>{inr(colTotal(c.key))}</td>
              ))}
              <td style={{ ...num, ...th }} data-total="deductions">{inr(sum('deductions'))}</td>
              <td style={{ ...num, ...th }} data-total="tax">{inr(sum('tax'))}</td>
              <td style={{ ...num, ...th }} data-total="net">{inr(sum('net'))}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, fontSize: 11 }}>
        <div style={{ color: '#555' }}>{t('Generated on')} {new Date(data.generatedAt).toLocaleString('en-IN')}{data.generatedBy ? ` · ${t('by')} ${data.generatedBy}` : ''}</div>
        <div style={{ textAlign: 'center' }}>
          {/* Authorized signature image from Company Profile (falls back to a blank
              signing space when none is uploaded). */}
          {m?.digitalSignatureImage
            ? <img src={m.digitalSignatureImage} alt="signature" style={{ height: 38, objectFit: 'contain', display: 'block', margin: '0 auto 2px', minWidth: 120 }} />
            : <div style={{ height: 40 }} />}
          <div style={{ borderTop: '1px solid #333', paddingTop: 4, minWidth: 200 }}>{t('For')} {m?.name || 'Company'}<br /><span style={{ fontSize: 10, color: '#555' }}>{t('Authorised Signatory')}</span></div>
        </div>
      </div>
    </div>
  );
};

export default SalaryRegisterTemplate;
