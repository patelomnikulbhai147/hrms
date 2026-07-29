# Standalone Demo Pages

Two self-contained HTML files that reproduce the live ZeniaHR modules for
presentation. **Double-click either file** — no server, no build, no install.

| File | Module |
|---|---|
| `payroll.html` | Payroll → Enterprise Payroll Management |
| `invoice-management.html` | Invoice Management |

## What they are

Faithful reproductions of the real screens, extracted from the application's own
source: the same design tokens (`frontend/src/index.css`), the same button tone
system (`.btn-primary` / `.btn-secondary` / `.btn-success` …), the same badge
palette, card radii, shadows, table styling, tab language and layout structure as
`components/payroll/PayrollWorkbench.tsx` and `pages/InvoiceManagement.tsx`.

Everything that was loaded from the API is replaced with realistic sample data of
the same shape. **No React, no Vite, no Node, no API, no database.**

## What works

**Both** — sidebar + topbar shell, hover states, transitions, modals (click-outside
and <kbd>Esc</kbd> to close), toasts, responsive layout down to 430px, keyboard
focus states, inline SVG icons that render with no network access.

**payroll.html** — 6 dashboard cards · 6-step payroll workflow · 18-column payroll
table with a sticky Actions column · search · branch & department filters · row
selection driving the workflow scope banner · pagination (24 records, 15 per page)
· row action menu · **View payroll details** modal (employee salary details,
earnings & deductions, net salary, payroll status) · Generate Payroll modal ·
Apply Bonus modal · Export dropdown.

**invoice-management.html** — 7 tabs · dashboard KPI cards + monthly revenue chart
+ recent/upcoming lists · money & count cards · invoice list with search, status
and transaction filters · status badges · **View invoice** modal (customer
information, line items, live CGST/SGST vs IGST totals, payment history) ·
Record Payment (updates the totals and status live) · **Print / Download**, which
renders a real A4 tax-invoice document through the browser print dialog ·
Create Invoice with live GST calculation · Customers · Products & Services ·
Templates & Branding · Settings.

The GST maths is genuinely computed by a client mirror of the server's
`invoiceCalc` — intra-state supplies split CGST/SGST, inter-state charge IGST — so
changing the customer or quantities on the Create Invoice tab recalculates
correctly rather than showing a fixed number.

## Fonts

Inter and Plus Jakarta Sans load from Google Fonts when the machine is online, which
matches the application. **Offline they fall back to the system sans stack** and the
pages still render correctly — only the typeface differs. Everything else (icons,
colours, layout, behaviour) is embedded in the file and needs no network at all.

## Verified

Driven through a real headless browser from `file://`, exactly as double-clicking
would open them (`backend/scripts/shotDemoHtml.js`):

- 0 console errors, 0 failed local requests, in both files
- 0 horizontal overflow at 430px
- every icon placeholder rendered (0 unpainted)
- search, filters, pagination, selection, tabs, modals and payment recording all
  asserted working

Screenshots: `screenshots/demo-html/`.
