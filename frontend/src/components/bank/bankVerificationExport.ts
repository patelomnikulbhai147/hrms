/**
 * bankVerificationExport.ts
 *
 * Download / print / copy actions for a verification report (§8).
 *
 * Every exporter reads the SAME `VerificationView` the screen renders, so a
 * downloaded PDF, a printed sheet and the page itself can never disagree about
 * what was verified. Account numbers stay masked and the technical block only
 * appears when the record carried one — an export is not a way around a
 * permission the API already applied.
 */

import { formatDateTime } from '@/utils/formatDate';
import {
  VerificationView,
  buildTimeline,
  maskAccount,
  nameMatchLabel,
  orNA,
  statusLabel,
} from './bankVerification';

const line = (label: string, value: unknown): [string, string] => [label, orNA(value)];

/** The report as label/value sections — the one description both exporters use. */
export function buildReportSections(view: VerificationView): Array<{ title: string; rows: [string, string][] }> {
  const sections: Array<{ title: string; rows: [string, string][] }> = [
    {
      title: 'Verification Summary',
      rows: [
        line('Verification Status', statusLabel(view.status)),
        line('Verified At', view.verifiedAt ? formatDateTime(view.verifiedAt) : null),
        line('Verification Provider', view.verificationSource || view.provider),
        line('Reference ID', view.referenceId),
        line('Verification ID', view.verificationId),
        line('Environment', view.environment),
        line('API Response Time', view.responseTimeMs != null ? `${view.responseTimeMs} ms` : null),
        line('Verification Credits Used', view.verificationCost != null ? String(view.verificationCost) : null),
        line('Verified By', view.verifiedBy),
        line('Company', view.companyName),
        line('Branch', view.branchName),
      ],
    },
    {
      title: 'Employee Entered Details',
      rows: [
        line('Employee Name', view.entered.employeeName),
        line('Employee ID', view.entered.employeeCode),
        line('Account Number', maskAccount(view.entered.accountNumber)),
        line('IFSC Code', view.entered.ifsc),
        line('Phone Number', view.entered.phone),
        line('Email', view.entered.email),
        line('Branch', view.entered.branch),
        line('Department', view.entered.department),
        line('Designation', view.entered.designation),
      ],
    },
    {
      title: 'Bank Verification Result',
      rows: [
        line('Account Holder Name', view.accountHolderName),
        line('Bank Name', view.bankName),
        line('Branch Name', view.bankBranch),
        line('Branch Address', view.branchAddress),
        line('City', view.city),
        line('District', view.district),
        line('State', view.state),
        line('IFSC', view.ifsc),
        line('MICR Code', view.micr),
        line('SWIFT Code', view.swift),
        line('UTR', view.utr),
        line('Account Status', view.accountStatus),
        line('Account Status Code', view.accountStatusCode),
        line('Verification Message', view.verificationMessage || view.errorMessage),
        line('Verification Source', view.verificationSource),
      ],
    },
    {
      title: 'Name Match',
      rows: [
        line('Employee Name', view.entered.employeeName),
        line('Bank Account Holder Name', view.accountHolderName),
        line('Name Match Result', nameMatchLabel(view.nameMatchResult)),
        line('Match Percentage', view.nameMatchScore != null ? `${view.nameMatchScore}%` : null),
        line('Determined By', view.nameMatchSource === 'PROVIDER' ? 'Verification provider' : view.nameMatchSource === 'COMPUTED' ? 'ZeniaHR comparison' : null),
      ],
    },
    {
      title: 'Verification Timeline',
      rows: buildTimeline(view).map((step) => [
        step.label,
        step.timestamp ? formatDateTime(step.timestamp) : orNA(null),
      ]) as [string, string][],
    },
  ];

  // Technical detail is exported only if the record actually carried it, which
  // the API decides by role — the export never widens access.
  if (view.permissions?.canSeeTechnical) {
    sections.push({
      title: 'Technical Details',
      rows: [
        line('Provider', view.provider),
        line('Environment', view.environment),
        line('API Latency', view.responseTimeMs != null ? `${view.responseTimeMs} ms` : null),
        line('HTTP Response Code', view.httpStatus),
        line('Request ID', view.requestId),
        line('Reference ID', view.referenceId),
        line('Verification ID', view.verificationId),
        line('Retry Count', view.retryCount),
        // Verification credits are a quota of API requests, never a currency —
        // the exported document must not imply an amount of money either.
        line('Verification Credits Used', view.verificationCost != null ? String(view.verificationCost) : null),
        line('Verification Credits Before', view.walletBalanceBefore != null ? String(view.walletBalanceBefore) : null),
        line('Verification Credits After', view.walletBalanceAfter != null ? String(view.walletBalanceAfter) : null),
      ],
    });
  }

  return sections;
}

const fileStem = (view: VerificationView) =>
  `Bank_Verification_${(view.entered.employeeCode || view.entered.employeeName || view.referenceId || 'record')
    .toString()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .slice(0, 40)}`;

/** Downloadable A4 PDF (§8). */
export async function downloadVerificationPdf(view: VerificationView, companyName?: string | null) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text('Bank Account Verification Report', margin, 52);

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(companyName || view.companyName || 'ZeniaHR', margin, 70);

  // Status chip, coloured the same way the screen colours it.
  const tone = view.status === 'VERIFIED' ? [16, 185, 129] : view.status === 'FAILED' || view.status === 'NETWORK_ERROR' ? [220, 38, 38] : [217, 119, 6];
  doc.setFillColor(tone[0], tone[1], tone[2]);
  const chip = statusLabel(view.status).toUpperCase();
  const chipWidth = doc.getTextWidth(chip) + 18;
  doc.roundedRect(pageWidth - margin - chipWidth, 38, chipWidth, 20, 5, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(chip, pageWidth - margin - chipWidth + 9, 52);

  let cursorY = 90;
  for (const section of buildReportSections(view)) {
    autoTable(doc, {
      startY: cursorY,
      head: [[section.title, '']],
      body: section.rows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55] },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold', textColor: [75, 85, 99] } },
      margin: { left: margin, right: margin },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 16;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated ${formatDateTime(new Date().toISOString())} · Account numbers are masked to the last 4 digits.`,
    margin,
    doc.internal.pageSize.getHeight() - 24
  );

  doc.save(`${fileStem(view)}.pdf`);
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Print-ready sheet, opened in its own window (§8). */
export function printVerificationReport(view: VerificationView, companyName?: string | null) {
  const sections = buildReportSections(view);
  const tone = view.status === 'VERIFIED' ? '#059669' : view.status === 'FAILED' || view.status === 'NETWORK_ERROR' ? '#dc2626' : '#d97706';

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Bank Account Verification Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#111827; margin:0; padding:28px 32px; }
  h1 { font-size:19px; margin:0 0 4px; }
  .sub { color:#6b7280; font-size:12px; margin-bottom:18px; }
  .chip { display:inline-block; padding:4px 12px; border-radius:999px; color:#fff; background:${tone}; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e5e7eb; padding-bottom:14px; margin-bottom:18px; }
  section { margin-bottom:18px; break-inside:avoid; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#374151; background:#f3f4f6; padding:7px 10px; margin:0 0 0; border:1px solid #e5e7eb; border-bottom:none; }
  table { width:100%; border-collapse:collapse; }
  td { border:1px solid #e5e7eb; padding:6px 10px; font-size:11.5px; vertical-align:top; }
  td.k { width:34%; font-weight:600; color:#4b5563; background:#fafafa; }
  footer { margin-top:24px; border-top:1px solid #e5e7eb; padding-top:10px; color:#9ca3af; font-size:10px; }
  @media print { body { padding:0; } @page { margin:14mm; } }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>Bank Account Verification Report</h1>
      <div class="sub">${escapeHtml(companyName || view.companyName || 'ZeniaHR')}${view.referenceId ? ` · Ref ${escapeHtml(view.referenceId)}` : ''}</div>
    </div>
    <span class="chip">${escapeHtml(statusLabel(view.status))}</span>
  </div>
  ${sections
    .map(
      (section) => `<section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>${section.rows
        .map((row) => `<tr><td class="k">${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`)
        .join('')}</table>
    </section>`
    )
    .join('')}
  <footer>Generated ${escapeHtml(formatDateTime(new Date().toISOString()))} · Account numbers are masked to the last 4 digits. This report is generated from an immutable verification record.</footer>
</body></html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer,width=980,height=800');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Let the document lay out before the print dialog measures it.
  setTimeout(() => win.print(), 250);
  return true;
}

/** Machine-readable export of exactly what this user is entitled to see (§8). */
export function exportVerificationJson(view: VerificationView) {
  const payload: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    status: view.status,
    verified: view.verified,
    verifiedAt: view.verifiedAt,
    provider: view.provider,
    verificationSource: view.verificationSource,
    environment: view.environment,
    referenceId: view.referenceId,
    verificationId: view.verificationId,
    responseTimeMs: view.responseTimeMs,
    verificationCost: view.verificationCost,
    verifiedBy: view.verifiedBy,
    company: view.companyName,
    branch: view.branchName,
    enteredDetails: { ...view.entered, accountNumber: maskAccount(view.entered.accountNumber) },
    bankResponse: {
      accountHolderName: view.accountHolderName,
      bankName: view.bankName,
      branchName: view.bankBranch,
      branchAddress: view.branchAddress,
      city: view.city,
      district: view.district,
      state: view.state,
      ifsc: view.ifsc,
      micr: view.micr,
      swift: view.swift,
      utr: view.utr,
      accountStatus: view.accountStatus,
      accountStatusCode: view.accountStatusCode,
      verificationMessage: view.verificationMessage,
    },
    nameMatch: {
      enteredName: view.entered.employeeName,
      bankName: view.accountHolderName,
      result: view.nameMatchResult,
      score: view.nameMatchScore,
      source: view.nameMatchSource,
    },
    timeline: buildTimeline(view).map((s) => ({ step: s.label, timestamp: s.timestamp, state: s.state })),
  };

  if (view.permissions?.canSeeTechnical) {
    payload.technical = {
      httpStatus: view.httpStatus,
      requestId: view.requestId,
      retryCount: view.retryCount,
      walletBalanceBefore: view.walletBalanceBefore,
      walletBalanceAfter: view.walletBalanceAfter,
      requestTimestamp: view.requestTimestamp,
      responseTimestamp: view.responseTimestamp,
    };
  }
  if (view.permissions?.canSeeRaw) {
    payload.rawRequest = view.rawRequest ?? null;
    payload.rawResponse = view.rawResponse ?? null;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileStem(view)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Clipboard copy with a graceful fallback for non-secure contexts. */
export async function copyText(value?: string | null): Promise<boolean> {
  const text = String(value ?? '').trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
