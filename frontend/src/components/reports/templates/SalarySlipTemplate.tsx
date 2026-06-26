import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';
import { t as translate } from '../../../utils/reportTranslations';

// ── SALARY SLIP (PAY SLIP) ───────────────────────────────────────────────────
const bd = '1px solid #222';
const td: React.CSSProperties = { border: bd, padding: '2px 5px', fontSize: 10.5, lineHeight: 1.3 };
const lbl: React.CSSProperties = { ...td, fontWeight: 600 };
const numC: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const Slip: React.FC<{ r: any; m: any; lang?: string }> = ({ r, m, lang = 'en' }) => {
  const t = (txt: string) => translate(txt, lang);
  const rates = m?.rates || { pfRate: 12, esicRate: 3.25, profTaxRate: 200 };
  const basic = Number(r.basic) || 0;
  const totalDeduction = Number(r.deductions) || 0;
  
  const pf = Math.min(totalDeduction, Math.round((basic * rates.pfRate) / 100));
  const esic = Math.min(Math.max(0, totalDeduction - pf), Math.round((basic * rates.esicRate) / 100));
  const pt = Math.min(Math.max(0, totalDeduction - pf - esic), Number(rates.profTaxRate) || 0);
  const other = Math.max(0, totalDeduction - pf - esic - pt);
  const totalEarnings = (Number(r.basic) || 0) + (Number(r.allowances) || 0) + (Number(r.bonus) || 0);

  // Statutory rates exposed to the live-recalc engine so the PF / ESI / PT / Other
  // split re-derives when Basic or Total Deductions is edited (data-const on the
  // slip scope; consumed by data-formula expressions — see reportRecalc.ts).
  const recalcConsts = JSON.stringify({ pfRate: Number(rates.pfRate) || 0, esicRate: Number(rates.esicRate) || 0, profTaxRate: Number(rates.profTaxRate) || 0 });
  return (
    <div data-recalc-scope="salary_slip" data-row data-const={recalcConsts} style={{ border: bd, width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, paddingTop: 3, textDecoration: 'underline' }}>{m?.name || 'Company'}</div>
      {m?.branchName && <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 10 }}>{m.branchName}</div>}
      {m?.address && <div style={{ textAlign: 'center', fontSize: 8.5, padding: '0 6px 3px' }}>{m.address}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: bd }}>
        <tbody>
          <tr>
            <td style={{ ...lbl, width: '22%' }}>{t('PAY SLIP')}</td>
            <td style={{ ...td, fontWeight: 700 }} colSpan={3}>{r.period || `${r.month || ''} ${r.year || ''}`}</td>
          </tr>
          <tr>
            <td style={lbl}>{t('Employee Name')}</td>
            <td style={{ ...td, textAlign: 'center', fontWeight: 700 }} colSpan={2}>{r.name}</td>
            <td style={td}><b>{t('Sr.')}</b> {r.sr}</td>
          </tr>
          <tr>
            <td style={lbl}>{t('UAN No.')}</td><td style={td}>{r.uan || '—'}</td>
            <td style={lbl}>{t('PF No.')}</td><td style={td}>{r.pfNumber || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>{t('ESIC No.')}</td><td style={td}>{r.esiNumber || '—'}</td>
            <td style={lbl}>{t('EMP ID')}</td><td style={td}>{r.code || '—'}</td>
          </tr>
          <tr>
            <td style={lbl}>{t('Designation')}</td><td style={td}>{r.designation || '—'}</td>
            <td style={lbl}>{t('Work Place')}</td><td style={td}>{r.workPlace || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Earnings / Deductions grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: bd }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ ...lbl, textAlign: 'center' }}>{t('Day')}</th>
            <th style={{ ...lbl, textAlign: 'center' }}>{t('Allowance')}</th>
            <th style={{ ...lbl, textAlign: 'center' }}>{t('Amount')}</th>
            <th style={{ ...lbl, textAlign: 'center' }}>{t('Deduction')}</th>
            <th style={{ ...lbl, textAlign: 'center' }}>{t('Net Pay')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{t('Present Day')} &nbsp;<b>{r.presentDays ?? 0}</b></td>
            <td style={td}>{t('Basic')}</td><td style={numC} data-cell="basic">{inr(r.basic)}</td>
            <td style={td}>{t('PF')}</td>
            {/* Net Pay — derived: (Basic + Allowances + Bonus) − Total Deductions. */}
            <td style={{ ...numC, fontWeight: 800, verticalAlign: 'middle' }} rowSpan={6} data-cell="net" data-formula="basic + allowances + bonus - deductions" data-nonneg>{inr(r.net)}</td>
          </tr>
          <tr>
            <td style={td}>{t('CL Taken')} &nbsp;<b>{r.clDays ?? 0}</b></td>
            <td style={td}>{t('Allowances')}</td><td style={numC} data-cell="allowances">{inr(r.allowances)}</td>
            {/* PF = min(Total Deductions, Basic × pfRate%). Derived from Basic + Total Ded. */}
            <td style={td} data-cell="pf" data-formula="min(deductions, round(basic * pfRate / 100))">{inr(pf)}</td>
          </tr>
          <tr>
            <td style={td}>{t('SL Taken')} &nbsp;<b>{r.slDays ?? 0}</b></td>
            <td style={td}>{t('Bonus')}</td><td style={numC} data-cell="bonus">{inr(r.bonus)}</td>
            <td style={td}>{t('ESIC')} &nbsp; <span data-cell="esic" data-formula="min(max(0, deductions - pf), round(basic * esicRate / 100))">{inr(esic)}</span></td>
          </tr>
          <tr>
            <td style={td}>{t('PL Taken')} &nbsp;<b>{r.plDays ?? 0}</b></td>
            <td style={td}>{t('O. Allowance')}</td><td style={numC}>—</td>
            <td style={td}>{t('Prof. Tax')} &nbsp; <span data-cell="pt" data-formula="min(max(0, deductions - pf - esic), profTaxRate)">{inr(pt)}</span></td>
          </tr>
          <tr>
            <td style={td}>{t('LWP')} &nbsp;<b>{r.lwpDays ?? 0}</b></td>
            <td style={td}>{t('OT Hrs')}</td><td style={numC}>{r.otHours ?? 0}</td>
            <td style={td}>{t('Other')} &nbsp; <span data-cell="other" data-formula="max(0, deductions - pf - esic - pt)">{inr(other)}</span></td>
          </tr>
          <tr>
            <td style={{ ...lbl }}>{t('Total Day')} &nbsp;<b>{r.payableDays ?? 0}</b></td>
            <td style={lbl}>{t('Total Earnings')}</td><td style={{ ...numC, fontWeight: 700 }} data-cell="totalEarnings" data-sum-of="basic allowances bonus">{inr(totalEarnings)}</td>
            {/* Total Deductions — editable source that drives the PF/ESI/PT/Other split. */}
            <td style={lbl}>{t('Total Ded.')} &nbsp; <b data-cell="deductions">{inr(totalDeduction)}</b></td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 8.5, padding: '2px 5px', borderTop: bd, textAlign: 'center' }}>
        {t('Payment Transferred to Employee A/C No.')} {r.accountNumber || '—'} {t('via')} "NEFT".
      </div>
    </div>
  );
};

export const SalarySlipTemplate: React.FC<TemplateProps> = ({ data, lang = 'en' }) => {
  const t = (txt: string) => translate(txt, lang);
  const m = data.meta;
  const rows = data.rows || [];
  return (
    <div style={{ width: 1040, margin: '0 auto', background: '#fff', padding: 14 }}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Arial', fontSize: 12 }}>{t('No payslips for the selected period.')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {rows.map((r, i) => <Slip key={i} r={r} m={m} lang={lang} />)}
        </div>
      )}
    </div>
  );
};

export default SalarySlipTemplate;
