import React from 'react';
import { type TemplateProps } from './types';
import { inr } from '../reportExport';
import { t as translate } from '../../../utils/reportTranslations';

// ── FORM NO. 16 (Part A + Part B) ────────────────────────────────────────────
const b = '1px solid #000';
const c: React.CSSProperties = { border: b, padding: '3px 6px', fontSize: 10.5, verticalAlign: 'top' };
const right: React.CSSProperties = { ...c, textAlign: 'right', whiteSpace: 'nowrap' };
const head: React.CSSProperties = { ...c, fontWeight: 700, textAlign: 'center', background: '#f3f4f6' };

const Certificate: React.FC<{ r: any; m: any; year?: number; isLast: boolean; lang?: string }> = ({ r, m, year, isLast, lang = 'en' }) => {
  const t = (txt: string) => translate(txt, lang);
  const Y = year || new Date().getFullYear();
  const ay = `${Y}-${String((Y + 1) % 100).padStart(2, '0')}`;
  const from = `01/04/${Y}`; const to = `31/03/${Y + 1}`;

  return (
    <div style={{ width: 880, margin: '0 auto', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', pageBreakAfter: isLast ? 'auto' : 'always', marginBottom: isLast ? 0 : 26 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b }}>
        <tbody>
          {/* Title */}
          <tr>
            <td style={{ ...c, width: '70%', textAlign: 'center', fontWeight: 700 }}>
              {t('Certificate under section 203 of the Income-tax Act, 1961 for')}<br />{t('Tax deducted at source on Salary')}
            </td>
            <td style={{ ...c, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{t('FORM NO. 16')}</div>
              <div style={{ fontSize: 9 }}>{t('[See rule 31(1)(a)]')}</div>
            </td>
          </tr>
          {/* Employer / Employee */}
          <tr>
            <td style={c}>
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>{t('Name & Address of the Employer')}</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{m?.name || '—'}</div>
              {m?.branchName && <div style={{ fontWeight: 700 }}>{m.branchName}</div>}
              <div>{m?.address || ''}</div>
            </td>
            <td style={c}>
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>{t('Name & Designation of the Employee')}</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{r.name}</div>
              <div>{[r.designation, r.department].filter(Boolean).join(', ') || '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* PAN / TAN / CIT / AY / Period grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr>
            <td style={head}>{t('PAN of Deductor')}</td><td style={head}>{t('TAN of Deductor')}</td><td style={head}>{t('PAN of Employee')}</td>
          </tr>
          <tr>
            <td style={{ ...c, textAlign: 'center' }}>{m?.panNumber || '---'}</td>
            <td style={{ ...c, textAlign: 'center' }}>---</td>
            <td style={{ ...c, textAlign: 'center' }}>{r.pan || '---'}</td>
          </tr>
          <tr>
            <td style={head}>{t('CIT (TDS)')}</td><td style={head}>{t('Assessment Year')}</td><td style={head}>{t('Period')}</td>
          </tr>
          <tr>
            <td style={{ ...c, textAlign: 'center' }}>—</td>
            <td style={{ ...c, textAlign: 'center' }}>{ay}</td>
            <td style={{ ...c, textAlign: 'center' }}>{t('From')} {from} &nbsp; {t('To')} {to}</td>
          </tr>
        </tbody>
      </table>

      {/* Quarterly TDS summary */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={head} colSpan={3}>{t('Summary of tax deducted at source in respect of deductee')}</td></tr>
          <tr>
            <td style={head}>{t('Quarter')}</td>
            <td style={head}>{t('Amount of tax deducted')}</td>
            <td style={head}>{t('Amount of tax deposited / remitted')}</td>
          </tr>
          {['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'].map(q => (
            <tr key={q}><td style={c}>{t(q)}</td><td style={{ ...c, textAlign: 'center' }}>---</td><td style={{ ...c, textAlign: 'center' }}>---</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={c}>{t('Total')}</td>
            <td style={right}>{inr(r.tds)}</td>
            <td style={right}>{inr(r.tds)}</td>
          </tr>
        </tbody>
      </table>

      {/* PART-B */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={{ ...head }} colSpan={2}>{t('PART-B — DETAILS OF SALARY PAID AND TAX DEDUCTED')}</td></tr>
          {[
            ['1. Gross Salary — Salary as per provisions u/s 17(1)', inr(r.grossSalary)],
            ['   (b) Value of perquisites u/s 17(2)', '---'],
            ['   (c) Profits in lieu of salary u/s 17(3)', '---'],
            ['   (d) TOTAL', inr(r.grossSalary)],
            ['2. Less: Allowance exempt u/s 10', '---'],
            ['3. Balance (1 - 2)', inr(r.grossSalary)],
            ['4. Deductions u/s 16 (Entertainment / Tax on Employment)', '---'],
            ['6. Income chargeable under the head “Salaries”', inr(r.grossSalary)],
            ['8. Gross Total Income', inr(r.grossSalary)],
            ['10. Aggregate deductible amount under Chapter VI-A', inr(r.deductions)],
            ['11. TOTAL INCOME (8 - 10)', inr(r.taxable)],
            ['14. Tax Payable', inr(r.tds)],
            ['17. Tax deducted at source (TDS)', inr(r.tds)],
          ].map(([label, val], i) => (
            <tr key={i} style={(label as string).startsWith('   ') ? {} : { fontWeight: 600 }}>
              <td style={c}>{t(label)}</td>
              <td style={{ ...right, width: 150 }}>{val === '---' ? '---' : `Rs. ${val}`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Verification */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: b, borderTop: 'none' }}>
        <tbody>
          <tr><td style={{ ...head }}>{t('V E R I F I C A T I O N')}</td></tr>
          <tr><td style={{ ...c, fontSize: 9.5 }}>
            {t('I, on behalf of')} <b>{m?.name || t('the employer')}</b>, {t('certify that a sum of Rs.')} {inr(r.tds)}/- {t('has been deducted and deposited to the credit of the central government. i further certify that the information given above is true, complete and correct and is based on the books of account, documents, tds statements and other available records.')}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
              <span>{t('Place / Date')}: ____________________</span>
              <span style={{ textAlign: 'right' }}>{t('For')} {m?.name || 'Company'}<br />{m?.signatureText || `(${t('Authorized Signatory')})`}</span>
            </div>
          </td></tr>
        </tbody>
      </table>
    </div>
  );
};

export const Form16Template: React.FC<TemplateProps> = ({ data, lang = 'en' }) => {
  const t = (txt: string) => translate(txt, lang);
  const rows = data.rows || [];
  return (
    <div style={{ background: '#fff', padding: 14 }}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Arial', fontSize: 12 }}>{t('No Form 16 data for the selected year.')}</div>
      ) : (
        rows.map((r, i) => <Certificate key={i} r={r} m={data.meta} year={data.filters?.year} isLast={i === rows.length - 1} lang={lang} />)
      )}
    </div>
  );
};

export default Form16Template;
