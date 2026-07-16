// ── Scheduled Custom Reports ──────────────────────────────────────────────────
// Emails saved Custom Reports on a daily / weekly / monthly cadence. A report's
// schedule lives in the `custom_reports.schedule` JSON column:
//   { enabled, freq:'daily'|'weekly'|'monthly', time:'HH:MM', weekday:0-6,
//     day:1-28, recipients:['a@x.com'], format:'csv'|'excel', role, lastRunAt }
// Each run executes the report through the injection-safe [[customReportEngine]]
// with the SAME role that was captured when the schedule was saved (so sensitive
// columns stay gated), renders CSV / Excel-HTML, and sends via emailService.
// Idempotent per day via lastRunAt. Disable with env REPORT_SCHEDULER=off.
const prisma = require('../config/prisma');
const { runReport } = require('./customReportEngine');
let email = {};
try { email = require('./emailService'); } catch (_) { /* optional */ }

const TICK_MS = Number(process.env.REPORT_TICK_MS) || 60 * 60 * 1000; // hourly
const EXPORT_CAP = 10000;
const state = { startedAt: null, ticks: 0, lastTickAt: null, lastSent: 0 };
let timer = null, running = false;

const parseJson = (v, f) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? f); } catch { return f; } };
const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '09:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// Is a schedule due at `now` (and not already run today)?
function isDue(schedule, now) {
  if (!schedule || !schedule.enabled) return false;
  const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  if (last && dayStr(last) === dayStr(now)) return false;          // already ran today
  if (now.getHours() * 60 + now.getMinutes() < minutesOf(schedule.time)) return false; // before its time
  if (schedule.freq === 'weekly') return now.getDay() === (Number(schedule.weekday) || 0);
  if (schedule.freq === 'monthly') {
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === Math.min(Number(schedule.day) || 1, dim);
  }
  return true; // daily
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtCell = (v, type) => {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'number') { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v); }
  return String(v);
};

// Normalise a run result (flat or grouped) into flat { columns, rows } for export.
function flattenResult(result) {
  const columns = result.columns || [];
  if (result.grouped) {
    const rows = [];
    for (const g of result.groups || []) for (const r of g.rows || []) rows.push({ ...r, __group: g.label });
    return { columns, rows };
  }
  return { columns, rows: result.rows || [] };
}

function toCsv(columns, rows) {
  const esc = (s) => { const v = String(s ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(fmtCell(r[c.key], c.type))).join(',')).join('\n');
  return `${head}\n${body}`;
}

// Excel-compatible HTML table (opens natively in Excel as .xls).
function toExcelHtml(name, columns, rows) {
  const th = columns.map((c) => `<th style="background:#16284a;color:#fff;border:1px solid #ccc;padding:4px 8px">${escapeHtml(c.header)}</th>`).join('');
  const trs = rows.map((r) => `<tr>${columns.map((c) => `<td style="border:1px solid #ddd;padding:3px 8px;text-align:${c.align || 'left'}">${escapeHtml(fmtCell(r[c.key], c.type))}</td>`).join('')}</tr>`).join('');
  return `<html><head><meta charset="utf-8"></head><body><h3>${escapeHtml(name)}</h3><table border="1" style="border-collapse:collapse;font-family:Arial;font-size:12px"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
}

function emailBody(report, columns, rows, total) {
  const preview = rows.slice(0, 50);
  const th = columns.map((c) => `<th style="background:#16284a;color:#fff;padding:6px 8px;text-align:${c.align || 'left'};font-size:11px">${escapeHtml(c.header)}</th>`).join('');
  const trs = preview.map((r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">${columns.map((c) => `<td style="border-bottom:1px solid #eef2f7;padding:5px 8px;text-align:${c.align || 'left'};font-size:11px">${escapeHtml(fmtCell(r[c.key], c.type))}</td>`).join('')}</tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#0f172a">
    <h2 style="margin:0 0 4px">${escapeHtml(report.name)}</h2>
    <div style="color:#64748b;font-size:12px;margin-bottom:12px">${escapeHtml(report.description || '')} · ${total.toLocaleString('en-IN')} record(s) · Generated ${new Date().toLocaleString('en-IN')}</div>
    <table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
    ${rows.length > preview.length ? `<p style="color:#64748b;font-size:12px">Showing first ${preview.length} of ${total.toLocaleString('en-IN')} rows — full data attached.</p>` : ''}
    <p style="color:#94a3b8;font-size:11px;margin-top:16px">Automated report from HRMS Custom Report Builder.</p></div>`;
}

/**
 * Run one report + email it to the given recipients. Returns
 * { ok, delivered, rows, error }. Never throws.
 */
async function sendReportNow(report, { recipients, format = 'excel', role } = {}) {
  try {
    const to = [...new Set((recipients || []).map((e) => String(e).trim()).filter((e) => e.includes('@')))];
    if (!to.length) return { ok: false, error: 'No valid recipient email addresses.' };
    const config = report.config || {};
    const result = await runReport(prisma, { ...config, page: 1, limit: EXPORT_CAP }, { companyIds: [report.companyId], role: role || report.schedule?.role || 'Company Head' });
    if (result?.error) return { ok: false, error: result.error };
    const { columns, rows } = flattenResult(result);
    const total = result.grouped ? (result.grandTotals?.count ?? rows.length) : (result.total ?? rows.length);
    const base = String(report.name || 'Custom_Report').replace(/[^\w\-]+/g, '_');
    const attachments = [];
    if (format === 'csv') attachments.push({ filename: `${base}.csv`, content: toCsv(columns, rows), contentType: 'text/csv' });
    else attachments.push({ filename: `${base}.xls`, content: toExcelHtml(report.name, columns, rows), contentType: 'application/vnd.ms-excel' });

    if (!(email.isSmtpConfigured && email.isSmtpConfigured())) {
      // Dev fallback — log instead of sending, so the flow is testable without SMTP.
      console.log(`[report-scheduler] (dev, not sent) "${report.name}" → ${to.join(', ')} · ${rows.length} rows`);
      return { ok: true, delivered: false, devMode: true, rows: rows.length };
    }
    const res = await email.sendMail({ to: to.join(','), subject: `Report: ${report.name}`, text: `Your scheduled report "${report.name}" is attached (${total} records).`, html: emailBody(report, columns, rows, total), attachments });
    return { ok: !!res.delivered, delivered: !!res.delivered, rows: rows.length, error: res.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function loadScheduledReports() {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM custom_reports WHERE schedule IS NOT NULL`);
    return rows.map((r) => ({ ...r, config: parseJson(r.config, {}), schedule: parseJson(r.schedule, null) }))
      .filter((r) => r.schedule && r.schedule.enabled);
  } catch (_) { return []; } // table may not exist yet
}

async function tick() {
  if (running) return;
  running = true;
  const now = new Date();
  let sent = 0;
  try {
    const reports = await loadScheduledReports();
    for (const rep of reports) {
      if (!isDue(rep.schedule, now)) continue;
      const out = await sendReportNow(rep, { recipients: rep.schedule.recipients, format: rep.schedule.format, role: rep.schedule.role });
      const schedule = { ...rep.schedule, lastRunAt: now.toISOString(), lastResult: out.ok ? `Sent ${out.rows} rows` : `Failed: ${out.error || 'error'}` };
      await prisma.$executeRawUnsafe(`UPDATE custom_reports SET schedule = ? WHERE id = ?`, JSON.stringify(schedule), rep.id).catch(() => {});
      if (out.ok) sent++;
    }
    state.ticks++; state.lastTickAt = now; state.lastSent = sent;
    if (sent) console.log(`[report-scheduler] emailed ${sent} scheduled report(s)`);
  } catch (e) {
    console.error('[report-scheduler] tick failed:', e.message);
  } finally { running = false; }
}

const start = () => {
  if (process.env.REPORT_SCHEDULER === 'off') { console.log('[report-scheduler] disabled via REPORT_SCHEDULER=off'); return; }
  if (timer) return;
  state.startedAt = new Date();
  setTimeout(() => { tick(); timer = setInterval(tick, TICK_MS); }, 15000);
  console.log('[report-scheduler] scheduler started — every %sms', TICK_MS);
};
const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
const status = () => ({ ...state, enabled: process.env.REPORT_SCHEDULER !== 'off', tickMs: TICK_MS });

module.exports = { start, stop, tick, status, sendReportNow, isDue };
