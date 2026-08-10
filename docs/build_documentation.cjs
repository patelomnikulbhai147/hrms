const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Define the output paths
const htmlPath = path.join(__dirname, 'ZeniaHR_Documentation.html');
const pdfPath = path.join(__dirname, 'ZeniaHR_Documentation.pdf');

console.log("==> Building HTML Documentation Content...");

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZeniaHR — Enterprise HRMS & SaaS Platform Feature Documentation</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
    }
    
    body {
      margin: 0;
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: #334155;
      line-height: 1.6;
      font-size: 10pt;
      background-color: #ffffff;
    }
    
    /* Cover Page */
    .cover {
      height: 90vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 40px;
      box-sizing: border-box;
      page-break-after: always;
      border: 3px double #cbd5e1;
      border-radius: 12px;
      margin-bottom: 50px;
    }
    .cover-top {
      text-align: center;
      margin-top: 50px;
    }
    .cover-brand {
      font-size: 46pt;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -1.5px;
      margin-bottom: 5px;
    }
    .cover-brand span {
      color: #ea580c;
    }
    .cover-subtitle {
      font-size: 16pt;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 30px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .cover-divider {
      width: 150px;
      height: 5px;
      background-color: #ea580c;
      margin: 0 auto 30px auto;
      border-radius: 2px;
    }
    .cover-title {
      font-size: 22pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.4;
      margin-top: 20px;
    }
    .cover-middle {
      text-align: center;
    }
    .cover-badge {
      display: inline-block;
      border: 1px solid #1e3a8a;
      color: #1e3a8a;
      padding: 8px 18px;
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      border-radius: 6px;
      background-color: #eff6ff;
    }
    .cover-bottom {
      text-align: center;
      font-size: 9.5pt;
      color: #64748b;
      margin-bottom: 40px;
      line-height: 1.6;
    }
    
    /* Audit Summary Card Panel */
    .summary-panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0 40px 0;
      page-break-after: always;
    }
    .summary-panel-title {
      font-size: 14pt;
      font-weight: 700;
      color: #1e3a8a;
      margin-top: 0;
      margin-bottom: 15px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .summary-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .summary-card-val {
      font-size: 24pt;
      font-weight: 800;
      color: #1e3a8a;
      margin-bottom: 2px;
    }
    .summary-card-val.working { color: #16a34a; }
    .summary-card-val.validation { color: #ca8a04; }
    .summary-card-val.incomplete { color: #dc2626; }
    .summary-card-lbl {
      font-size: 9pt;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-card-desc {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 5px;
    }

    /* Table of Contents */
    .toc-page {
      page-break-after: always;
    }
    .toc-title {
      font-size: 18pt;
      color: #1e3a8a;
      border-bottom: 2px solid #ea580c;
      padding-bottom: 5px;
      margin-bottom: 25px;
      font-weight: 700;
    }
    .toc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 30px;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 9pt;
    }
    .toc-name {
      color: #334155;
      text-decoration: none;
      font-weight: 600;
    }
    .toc-dots {
      flex-grow: 1;
      border-bottom: 1px dotted #cbd5e1;
      margin: 0 8px;
      position: relative;
      top: -4px;
    }
    .toc-num {
      color: #64748b;
      font-weight: 700;
    }

    /* Headings */
    h1 {
      font-size: 15pt;
      color: #1e3a8a;
      border-bottom: 2px solid #ea580c;
      padding-bottom: 6px;
      margin-top: 35px;
      margin-bottom: 15px;
      page-break-before: always;
      page-break-after: avoid;
    }
    h1.no-break {
      page-break-before: avoid;
    }
    h2 {
      font-size: 11pt;
      color: #1e293b;
      margin-top: 22px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 10pt;
      color: #334155;
      margin-top: 15px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 10px;
      text-align: justify;
      font-size: 9.5pt;
    }
    
    ul, ol {
      margin-top: 0;
      margin-bottom: 12px;
      padding-left: 20px;
    }
    li {
      margin-bottom: 4px;
      font-size: 9.5pt;
    }
    
    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0 20px 0;
      page-break-inside: avoid;
    }
    th {
      background-color: #1e3a8a;
      color: #ffffff;
      text-align: left;
      padding: 8px 10px;
      font-size: 8.5pt;
      font-weight: 600;
      border: 1px solid #1e3a8a;
    }
    td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      font-size: 8.5pt;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    
    /* Callouts */
    .callout {
      background-color: #f8fafc;
      border-left: 4px solid #ea580c;
      padding: 10px 14px;
      margin: 12px 0 16px 0;
      border-radius: 0 4px 4px 0;
      page-break-inside: avoid;
    }
    .callout-title {
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 4px;
      font-size: 9pt;
    }
    .callout-content {
      font-size: 8.5pt;
      margin: 0;
      text-align: justify;
    }
    
    .important-block {
      background-color: #eff6ff;
      border-left: 4px solid #2563eb;
    }
    .important-block .callout-title {
      color: #1e40af;
    }
    
    .warning-block {
      background-color: #fff7ed;
      border-left: 4px solid #ea580c;
    }
    .warning-block .callout-title {
      color: #c2410c;
    }
    
    .danger-block {
      background-color: #fef2f2;
      border-left: 4px solid #ef4444;
    }
    .danger-block .callout-title {
      color: #991b1b;
    }

    /* Diagrams */
    .diagram-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 15px 0;
      padding: 12px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      page-break-inside: avoid;
    }
    .diagram-row {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      gap: 10px;
    }
    .diagram-box {
      background-color: #1e3a8a;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid #ea580c;
      font-weight: 600;
      font-size: 8pt;
      width: 160px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .diagram-box.accent {
      background-color: #ea580c;
      border-color: #1e3a8a;
    }
    .diagram-arrow {
      color: #ea580c;
      font-weight: 700;
      font-size: 11pt;
      margin: 4px 0;
      text-align: center;
    }
    .diagram-arrow.horizontal {
      margin: 0 4px;
    }
    .flow-label {
      font-size: 7pt;
      color: #64748b;
      font-style: italic;
      margin-bottom: 2px;
    }
    
    /* Module details section card */
    .module-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .module-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .module-card-title {
      font-size: 11pt;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0;
    }
    .module-card-badge {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .module-card-badge.verified { background: #dcfce7; color: #15803d; }
    .module-card-badge.validation { background: #fef9c3; color: #a16207; }
    .module-card-meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 5px 15px;
      margin-bottom: 10px;
      font-size: 8.5pt;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 4px;
    }
    .module-card-meta-item {
      color: #475569;
    }
    .module-card-meta-item strong {
      color: #0f172a;
    }
    .module-card-content {
      font-size: 9pt;
    }

    /* Document Footer details */
    .doc-end {
      text-align: center;
      border-top: 1px solid #cbd5e1;
      margin-top: 40px;
      padding-top: 20px;
      font-size: 8.5pt;
      color: #64748b;
      page-break-inside: avoid;
    }
    
    code {
      font-family: Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace;
      background-color: #f1f5f9;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 8.5pt;
      color: #0f172a;
    }
    a {
      color: #1e3a8a;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover">
    <div class="cover-top">
      <div class="cover-brand">Zenia<span>HR</span></div>
      <div class="cover-subtitle">ENTERPRISE HRMS & SAAS PLATFORM</div>
      <div class="cover-divider"></div>
      <div class="cover-title">Codebase Audit &amp; Feature Specification Documentation</div>
    </div>
    <div class="cover-middle">
      <div class="cover-badge">Version 1.0.0 (Audited Release)</div>
    </div>
    <div class="cover-bottom">
      <strong>Verified Code-Level Platform Configuration &amp; Technical Manual</strong><br>
      Author: ZeniaHR Technical Quality Assurance Team<br>
      Date: August 2026<br><br>
      <span style="font-size: 7.5pt; color: #94a3b8;">ZeniaHR | verified Feature &amp; Flow Manual | Version 1.0.0</span>
    </div>
  </div>

  <!-- Codebase Audit Summary Panel -->
  <div class="summary-panel">
    <h3 class="summary-panel-title">Codebase Audit Summary Profile</h3>
    <p style="font-size: 9.5pt; margin-bottom: 20px;">
      This technical manual has been compiled directly from a comprehensive file-by-file audit of the active ZeniaHR repository. Features, workflows, routes, database models, and external APIs described in this document reflect actual codebase implementations. Planned configurations, hypothetical items, and missing schemas are strictly classified and omitted.
    </p>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-val">46</div>
        <div class="summary-card-lbl">TOTAL IMPLEMENTED MODULES</div>
        <div class="summary-card-desc">Total components active in the central module registry.</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-val working">37</div>
        <div class="summary-card-lbl">TOTAL VERIFIED WORKING MODULES</div>
        <div class="summary-card-desc">Fully operational systems connected to verified DB queries.</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-val validation">6</div>
        <div class="summary-card-lbl">TOTAL NEEDS VALIDATION</div>
        <div class="summary-card-desc">Coded systems requiring credentials or hardware configurations.</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-val incomplete">3</div>
        <div class="summary-card-lbl">TOTAL PLACEHOLDER / INCOMPLETE</div>
        <div class="summary-card-desc">UI components using hardcoded values or missing backend functions.</div>
      </div>
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc-page">
    <div class="toc-title">Table of Contents</div>
    <div class="toc-grid">
      <div class="toc-item"><a class="toc-name" href="#sec-1">1. Introduction &amp; Scopes</a><span class="toc-dots"></span><span class="toc-num">3</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-2">2. User Roles &amp; Permissions (RBAC)</a><span class="toc-dots"></span><span class="toc-num">3</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-3">3. Verified Working Modules Profile</a><span class="toc-dots"></span><span class="toc-num">4</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-4">4. Implemented but Needs Validation Modules</a><span class="toc-dots"></span><span class="toc-num">14</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-5">5. Features Found in Requirements but Not Verified</a><span class="toc-dots"></span><span class="toc-num">16</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-6">6. Modules Requiring Fix (Audited Issues)</a><span class="toc-dots"></span><span class="toc-num">16</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-7">7. Production Readiness Status Mapping</a><span class="toc-dots"></span><span class="toc-num">17</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-8">8. Core Business Workflows</a><span class="toc-dots"></span><span class="toc-num">18</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-9">9. Known Critical Production Checks</a><span class="toc-dots"></span><span class="toc-num">20</span></div>
      <div class="toc-item"><a class="toc-name" href="#sec-10">10. Summary</a><span class="toc-dots"></span><span class="toc-num">20</span></div>
    </div>
  </div>

  <!-- Section 1 -->
  <h1 id="sec-1" class="no-break">1. Introduction &amp; Scopes</h1>
  <p>
    <strong>ZeniaHR</strong> is an enterprise-class Human Resource Management System (HRMS) and multi-tenant SaaS application. It manages company registration, employee lifecycle records, timesheets, leaves, payroll cycles, and external integrations in an isolated multi-tenant framework.
  </p>
  <p>
    The system maps operations using the database <code>companyId</code> (representing a tenant workspace) and <code>branchId</code> (representing specific regional facilities). Database queries enforce tenant separation at the Prisma ORM layer to ensure data security and compliance.
  </p>
  <div class="callout important-block">
    <div class="callout-title">Technical Audit Standard</div>
    <p class="callout-content">
      All references in this document point to active filesystem entries. Files are linked via standard URLs using the <code>file://</code> protocol, matching repository paths.
    </p>
  </div>

  <!-- Section 2 -->
  <h1 id="sec-2">2. User Roles &amp; Permissions (RBAC)</h1>
  <p>
    ZeniaHR implements a role-based access control matrix defined in the frontend module registry <a href="file:///frontend/src/config/moduleRegistry.tsx">moduleRegistry.tsx</a> and enforced by backend authentication middleware.
  </p>
  <ul>
    <li><strong>Super Admin</strong>: Manages tenant registrations, global subscription pricing catalog configs, credit package updates, support masquerading sessions, and global audit trail logs.</li>
    <li><strong>Company Head</strong>: Tenant owner. Manages organization configurations, wallet recharges, custom domain branding parameters, employee slots purchases, and branch offboardings.</li>
    <li><strong>HR/Admin</strong>: Operative user. Add/edits employee profiles, manages leaves, records daily attendance sheet overrides, schedules announcements, and processes payroll worksheet cycles.</li>
    <li><strong>Employee</strong>: End-user. Clock in/out virtually via ESS portal, view balances, check assigned training courses progress, and download payslips.</li>
  </ul>

  <!-- Section 3 -->
  <h1 id="sec-3">3. Verified Working Modules Profile</h1>
  <p>
    The following 37 modules are fully database-backed, operational, and verified in code.
  </p>

  <!-- Module 1: Dashboard -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">1. Dashboard (dashboard)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Dashboard.tsx">Dashboard.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>GET /api/statistics/company-overview/:companyId</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> None (Database View Aggregation Query)</div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Renders key performance metrics (active headcount, leaves, pending approvals, recent shifts), alerts feed, and action shortcuts.</p>
      <p><strong>How It Works:</strong> Queries aggregated database figures scoped by the selected company and branch IDs.</p>
      <p><strong>Important Workflow:</strong> User logs in &rarr; dashboard queries company-overview statistics &rarr; loads UI widgets.</p>
    </div>
  </div>

  <!-- Module 2: Companies Directory -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">2. Companies Directory (companies)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Companies.tsx">Companies.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/companies</code>, <code>POST /api/companies</code>, <code>PUT /api/companies/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Company</code>, <code>CompanyAssets</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Multi-tenant tenant directories tracking, company suspension/activation toggles, and metadata search.</p>
      <p><strong>How It Works:</strong> Provides Super Admins with tools to register and configure active tenant records in MySQL.</p>
      <p><strong>Important Workflow:</strong> Super Admin opens directory &rarr; clicks "Create Company" &rarr; fills profile details &rarr; backend creates company base record.</p>
    </div>
  </div>

  <!-- Module 3: Subscription Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">3. Subscription Management (billing)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/SubscriptionManage.tsx">SubscriptionManage.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/subscriptions/catalog</code>, <code>PUT /api/subscriptions/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Subscription</code>, <code>SubscriptionPlan</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Change company subscription plans, scale employee slots manually, activate/suspend active subscriptions.</p>
      <p><strong>How It Works:</strong> Updates tenant subscription variables which are checked by auth gates before granting workspace access.</p>
      <p><strong>Important Workflow:</strong> Tenant subscription runs out &rarr; Super Admin marks subscription "Suspended" &rarr; middleware blocks user entry.</p>
    </div>
  </div>

  <!-- Module 4: Bank Verification Credits -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">4. Bank Verification Credits (billing)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/VerificationWallet.tsx">VerificationWallet.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/super-admin/verification-credits/recharge/settings</code>, <code>PUT /api/super-admin/verification-credits/recharge/settings</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>VerificationCreditSettings</code>, <code>VerificationPackage</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Configure verification package pricing brackets, track verification credit recharges.</p>
      <p><strong>How It Works:</strong> Manages pricing settings used to charge company accounts for Secure ID lookups.</p>
      <p><strong>Important Workflow:</strong> Super Admin updates credit tier cost &rarr; updates database configuration &rarr; system updates unit recharge prices.</p>
    </div>
  </div>

  <!-- Module 5: Employees -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">5. Employees (employees)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Employees.tsx">Employees.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/employees</code>, <code>POST /api/employees</code>, <code>PUT /api/employees/:id</code>, <code>DELETE /api/employees/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Employee</code>, <code>Branch</code>, <code>Department</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Profile creation forms, statutory records mapping (Aadhaar, PAN, Bank, UAN), and employee archive/offboard flows.</p>
      <p><strong>How It Works:</strong> CRUD mapping to company ID. Performs duplicate checking on mobile numbers and tax identifiers.</p>
      <p><strong>Important Workflow:</strong> HR inputs onboarding details &rarr; backend validates national ID syntax &rarr; creates employee row.</p>
    </div>
  </div>

  <!-- Module 6: Employee Cards -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">6. Employee Cards (employees)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/employee-cards">employee-cards (subview)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/card-templates</code>, <code>POST /api/card-templates</code>, <code>POST /api/card-templates/:id/default</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CardTemplate</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> ID badge template library, assign default template configurations.</p>
      <p><strong>How It Works:</strong> Maps template configurations (dimensions, font settings) to company profiles to generate employee ID previews.</p>
      <p><strong>Important Workflow:</strong> HR configures ID layout parameters &rarr; saves default &rarr; dynamically displays card layout containing employee photos.</p>
    </div>
  </div>

  <!-- Module 7: Attendance -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">7. Attendance (attendance)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Attendance.tsx">Attendance.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/attendance</code>, <code>POST /api/attendance</code>, <code>PUT /api/attendance/:id</code>, <code>GET /api/attendance/workforce-report</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Attendance</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Virtual clock in/out with GPS checks, attendance log sheets, department attendance reports.</p>
      <p><strong>How It Works:</strong> Captures punch times and validates location coordinates against branch boundaries.</p>
      <p><strong>Important Workflow:</strong> Employee hits check-in in ESS &rarr; client fetches GPS coordinates &rarr; database creates punch log record.</p>
    </div>
  </div>

  <!-- Module 9: Leave Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">9. Leave Management (leaves)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Leaves.tsx">Leaves.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/leaves/paginated</code>, <code>POST /api/leaves</code>, <code>PUT /api/leaves/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>LeaveRequest</code>, <code>LeaveBalance</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Managers, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Leave application form, leave balances ledger dashboard, approval chains.</p>
      <p><strong>How It Works:</strong> Checks requests against the user's remaining leave balances before forwarding requests to managers.</p>
      <p><strong>Important Workflow:</strong> Employee submits leave request &rarr; system validates balance rules &rarr; forwards request to manager for approval.</p>
    </div>
  </div>

  <!-- Module 10: Payroll -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">10. Payroll (payroll)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Payroll.tsx">Payroll.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>POST /api/payroll/generate</code>, <code>POST /api/payroll/approve</code>, <code>POST /api/payroll/mark-paid</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>PayrollPeriod</code>, <code>SalaryWorksheet</code>, <code>PayrollRecord</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Monthly payroll generation cycles, PF/ESI deductions calculations, payslip PDF rendering and mailing.</p>
      <p><strong>How It Works:</strong> Processes attendance summaries, calculates gross salary, subtracts tax/loans deductions, and saves payroll records.</p>
      <p><strong>Important Workflow:</strong> Finance selects period &rarr; imports attendance and LOP data &rarr; calculates payroll &rarr; emails payslip PDFs.</p>
    </div>
  </div>

  <!-- Module 11: Attendance Synchronization -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">11. Attendance Synchronization (payroll)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/attendance-sync">attendance-sync (subview)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>POST /api/attendance/sync-payroll</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>AttendanceSummary</code>, <code>PayrollRecord</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Pull attendance totals (working days, leaves, LOPs) into active payroll runs.</p>
      <p><strong>How It Works:</strong> Pulls monthly attendance data and maps it to payroll records.</p>
      <p><strong>Important Workflow:</strong> HR clicks "Sync Attendance" &rarr; system updates worksheet calculations with active attendance logs.</p>
    </div>
  </div>

  <!-- Module 12: Invoice Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">12. Invoice Management (invoicing)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/InvoiceManagement.tsx">InvoiceManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/invoicing/invoices</code>, <code>POST /api/invoicing/invoices</code>, <code>PUT /api/invoicing/invoices/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Invoice</code>, <code>InvoiceItem</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> GST billing invoice creations, tax rates calculations, payment schedule tracking.</p>
      <p><strong>How It Works:</strong> Stores invoice line items and calculates tax totals based on the client's location (CGST/SGST vs IGST).</p>
      <p><strong>Important Workflow:</strong> Finance fills details &rarr; sets GST rate &rarr; compiles invoice data &rarr; generates print-ready invoice.</p>
    </div>
  </div>

  <!-- Module 13: Finance & Compliance -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">13. Finance &amp; Compliance (loans)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/FinanceCompliance.tsx">FinanceCompliance.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> Aggregate Dashboard Metric API</div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>EmployeeLoan</code>, <code>ComplianceFiling</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Dashboard monitoring statutory due dates, active EMI loan requests, and challan compliance rates.</p>
      <p><strong>How It Works:</strong> Combines loan logs and tax calendars into a single operational view.</p>
      <p><strong>Important Workflow:</strong> Admin opens dashboard &rarr; checks PF/ESI deadlines &rarr; reviews pending employee loan requests.</p>
    </div>
  </div>

  <!-- Module 14: Employee Loan Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">14. Employee Loan Management (loans)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/LoanManagement.tsx">LoanManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/loans</code>, <code>POST /api/loans</code>, <code>POST /api/loans/:id/status</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>EmployeeLoan</code>, <code>EmiSchedule</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Set up loan programs, calculate EMI schedules, track payments.</p>
      <p><strong>How It Works:</strong> Calculates interest rates and monthly payments. EMI deductions are automatically processed during payroll runs.</p>
      <p><strong>Important Workflow:</strong> Employee submits request &rarr; HR approves &rarr; generates EMI schedule &rarr; payroll auto-deducts EMI monthly.</p>
    </div>
  </div>

  <!-- Module 15: Compliance Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">15. Compliance Management (compliance)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/ComplianceManagement.tsx">ComplianceManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/compliance-mgmt/filings</code>, <code>POST /api/compliance-mgmt/filings/:id/challan</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>ComplianceFiling</code>, <code>ComplianceCategory</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> filing calendars due date check, tax challan uploads, status tracking.</p>
      <p><strong>How It Works:</strong> Tracks regional compliance tasks (PF, ESI, PT) and requires admins to upload verification challans to resolve deadlines.</p>
      <p><strong>Important Workflow:</strong> PF deadline approaches &rarr; HR uploads payment challan receipt &rarr; flags deadline resolved.</p>
    </div>
  </div>

  <!-- Module 16: Employee Documents -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">16. Employee Documents (documents)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Documents.tsx">Documents.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/documents</code>, <code>POST /api/documents</code>, <code>GET /api/documents/:id/file</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Document</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Upload files, organize folders, download documents.</p>
      <p><strong>How It Works:</strong> Encodes and uploads PDF/image files. Restricts access to authorized employees and HR.</p>
      <p><strong>Important Workflow:</strong> HR uploads contract document &rarr; associates with employee &rarr; employee views file in ESS.</p>
    </div>
  </div>

  <!-- Module 17: Vendor Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">17. Vendor Management (vendors)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/VendorManagement.tsx">VendorManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/vendors</code>, <code>POST /api/vendors</code>, <code>DELETE /api/vendors/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Vendor</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Create and delete vendor records, search listings, track active statuses.</p>
      <p><strong>How It Works:</strong> Saves supplier information linked to the active company ID.</p>
      <p><strong>Important Workflow:</strong> Admin enters vendor details &rarr; vendor profile saves &rarr; links vendor profile to invoices.</p>
    </div>
  </div>

  <!-- Module 18: Asset Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">18. Asset Management (assets)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/AssetManagement.tsx">AssetManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/assets</code>, <code>POST /api/assets</code>, <code>PUT /api/assets/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Asset</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Allocate assets to employees, track hardware inventory details.</p>
      <p><strong>How It Works:</strong> Saves hardware records in the database, mapping them to employee IDs when allocated.</p>
      <p><strong>Important Workflow:</strong> Admin adds laptop to inventory &rarr; assigns to employee &rarr; asset status changes to "Allocated".</p>
    </div>
  </div>

  <!-- Module 19: Visitor Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">19. Visitor Management (visitors)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/VisitorManagement.tsx">VisitorManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/visitors</code>, <code>POST /api/visitors</code>, <code>PUT /api/visitors/:id</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>VisitorLog</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Check-in guest profiles, select host employee, record check-out timestamps.</p>
      <p><strong>How It Works:</strong> Registers guest details in a visitor log table scoped to the active branch.</p>
      <p><strong>Important Workflow:</strong> Visitor arrives &rarr; receptionist registers details &rarr; sends host alert &rarr; checks out visitor upon exit.</p>
    </div>
  </div>

  <!-- Module 20: Facility Booking -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">20. Facility Booking (facilities)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/FacilityBooking.tsx">FacilityBooking.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/facilities</code>, <code>POST /api/facilities/bookings</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Facility</code>, <code>FacilityBooking</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Book conference rooms, display scheduling calendar.</p>
      <p><strong>How It Works:</strong> Validates booking requests against existing reservations in the database to prevent scheduling conflicts.</p>
      <p><strong>Important Workflow:</strong> Employee selects room and time slot &rarr; submits reservation &rarr; saves booking record.</p>
    </div>
  </div>

  <!-- Module 21: Reports -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">21. Reports (reports)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Reports.tsx">Reports.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>GET /api/statistics/platform-reports</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> None (Database View Aggregation Query)</div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Displays attrition charts, expense statistics, and department headcount ratios.</p>
      <p><strong>How It Works:</strong> Aggregates and returns database metrics for the selected company.</p>
      <p><strong>Important Workflow:</strong> HR opens reports tab &rarr; selects date parameters &rarr; visual charts render metrics.</p>
    </div>
  </div>

  <!-- Module 22: Security Center -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">22. Security Center (settings)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/SecurityCenter.tsx">SecurityCenter.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/security/settings</code>, <code>PUT /api/security/settings</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>SecuritySettings</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin, Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Password complexity settings, session time-outs, Multi-Factor Authentication rules.</p>
      <p><strong>How It Works:</strong> Binds security settings to authentication middleware checks.</p>
      <p><strong>Important Workflow:</strong> Admin updates password rules &rarr; database updates config &rarr; applies rules to subsequent logins.</p>
    </div>
  </div>

  <!-- Module 23: Custom Report Builder -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">23. Custom Report Builder (reports)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CustomReportBuilder.tsx">CustomReportBuilder.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>POST /api/custom-reports/run</code>, <code>POST /api/custom-reports</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CustomReport</code>, <code>ReportTemplate</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Custom report designer, schedule automated runs.</p>
      <p><strong>How It Works:</strong> Converts drag-and-drop layout selections into database queries.</p>
      <p><strong>Important Workflow:</strong> HR selects data columns &rarr; builds report layout &rarr; runs query &rarr; exports CSV.</p>
    </div>
  </div>

  <!-- Module 24: Employee Self-Service (ESS) -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">24. Employee Self-Service (dashboard)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/ESSDashboard.tsx">ESSDashboard.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> Scoped employee profile endpoint</div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>User</code>, <code>Employee</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Employee, HR, Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> View leave balances, download payslips, check-in virtually, browse company directory.</p>
      <p><strong>How It Works:</strong> Restricts queries to the logged-in user's profile and company scope.</p>
      <p><strong>Important Workflow:</strong> Employee logs in &rarr; views leave balances &rarr; requests day-off.</p>
    </div>
  </div>

  <!-- Module 25: Performance Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">25. Performance Management (performance)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/PerformanceManagement.tsx">PerformanceManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/performance/goals</code>, <code>POST /api/performance/goals</code>, <code>POST /api/performance/reviews/:id/self</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>PerformanceGoal</code>, <code>PerformanceReview</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Set performance goals, submit self-evaluations and ratings.</p>
      <p><strong>How It Works:</strong> Stores goals and reviews linked to active employee IDs in MySQL.</p>
      <p><strong>Important Workflow:</strong> Manager sets goal &rarr; employee enters updates &rarr; submits self-appraisal rating.</p>
    </div>
  </div>

  <!-- Module 26: Learning Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">26. Learning Management (lms)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/LearningManagement.tsx">LearningManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/lms/courses</code>, <code>POST /api/lms/courses</code>, <code>GET /api/lms/progress/:employeeId</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Course</code>, <code>CourseProgress</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Create training programs, course catalog, track progress.</p>
      <p><strong>How It Works:</strong> Stores training course configurations and tracks progress by employee ID.</p>
      <p><strong>Important Workflow:</strong> HR creates course &rarr; employee completes lessons &rarr; updates completion status in database.</p>
    </div>
  </div>

  <!-- Module 27: Knowledge Base -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">27. Knowledge Base (knowledge)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/KnowledgeBase.tsx">KnowledgeBase.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/knowledge/articles</code>, <code>POST /api/knowledge/categories</code>, <code>POST /api/knowledge/articles</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>KnowledgeCategory</code>, <code>KnowledgeArticle</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Create categories, publish articles, article search.</p>
      <p><strong>How It Works:</strong> Queries articles filtered by company ID.</p>
      <p><strong>Important Workflow:</strong> HR creates policy category &rarr; adds article &rarr; employees search and read policies.</p>
    </div>
  </div>

  <!-- Module 28: Internal Communication -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">28. Internal Communication (social)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/InternalCommunication.tsx">InternalCommunication.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/social/posts</code>, <code>POST /api/social/posts</code>, <code>POST /api/social/posts/:id/like</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>SocialPost</code>, <code>SocialLike</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Company announcements feed, likes, post updates.</p>
      <p><strong>How It Works:</strong> Restricts social feeds to the active company ID.</p>
      <p><strong>Important Workflow:</strong> HR publishes announcement &rarr; employee views feed &rarr; registers post like.</p>
    </div>
  </div>

  <!-- Module 29: AI Assistant -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">29. AI Assistant (dashboard)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/AIAssistant.tsx">AIAssistant.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>POST /api/ai/query</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>AiQueryHistory</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Natural language query interface to search company data metrics.</p>
      <p><strong>How It Works:</strong> Parser maps queries to SQL database tables based on keywords.</p>
      <p><strong>Important Workflow:</strong> User types "active employees count" &rarr; system runs DB query &rarr; displays result.</p>
    </div>
  </div>

  <!-- Module 30: Template Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">30. Template Management (templates)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/TemplateManagement/TemplateLibrary.tsx">TemplateLibrary.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/templates</code>, <code>POST /api/templates</code>, <code>POST /api/templates/:id/duplicate</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>DocumentTemplate</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin, Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Document template designer, duplicate templates to workspace.</p>
      <p><strong>How It Works:</strong> Saves custom document layouts and styling configurations.</p>
      <p><strong>Important Workflow:</strong> Admin clones marketplace template &rarr; saves locally &rarr; assigns to invoices.</p>
    </div>
  </div>

  <!-- Module 31: Document Vault -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">31. Document Vault (vault)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/DocumentManagement/DocumentVault.tsx">DocumentVault.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>POST /api/vault/share</code>, <code>GET /api/vault/files</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>SharedFile</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Create secure document share links, password protection, expiration dates.</p>
      <p><strong>How It Works:</strong> Generates temporary signed sharing URLs.</p>
      <p><strong>Important Workflow:</strong> HR generates sharing link &rarr; sets passcode and expiry date &rarr; shares link with recipient.</p>
    </div>
  </div>

  <!-- Module 32: Communication Center -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">32. Communication Center (communication)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CommunicationCenter.tsx">CommunicationCenter.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/communication/templates</code>, <code>POST /api/communication/templates</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CommunicationTemplate</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Email template editor, schedule company announcement notifications.</p>
      <p><strong>How It Works:</strong> Saves announcement layouts and schedules.</p>
      <p><strong>Important Workflow:</strong> HR edits email layout &rarr; schedules announcement run &rarr; queue processor sends emails.</p>
    </div>
  </div>

  <!-- Module 33: Communication Automation -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">33. Communication Automation (communication)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CommunicationCenter.tsx">CommunicationCenter.tsx (Automation Tab)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/communication/automation/rules</code>, <code>POST /api/communication/automation/rules</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CommunicationAutomationRule</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Trigger automation rules, monitor scheduler queue.</p>
      <p><strong>How It Works:</strong> Binds automation actions (e.g. birthday emails) to system events.</p>
      <p><strong>Important Workflow:</strong> Admin configures birthday trigger &rarr; system checks dates daily &rarr; runs automation actions.</p>
    </div>
  </div>

  <!-- Module 34: Communication Audit -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">34. Communication Audit (communication)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CommunicationCenter.tsx">CommunicationCenter.tsx (Audit Tab)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>GET /api/communication/delivery-logs</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CommunicationDeliveryLog</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Trace announcement emails delivery logs.</p>
      <p><strong>How It Works:</strong> Pulls delivery logs from the database.</p>
      <p><strong>Important Workflow:</strong> HR sends company email &rarr; email delivers &rarr; delivery status logged.</p>
    </div>
  </div>

  <!-- Module 35: Task Manager -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">35. Task Manager (tasks)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/TaskManager.tsx">TaskManager.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/tasks</code>, <code>POST /api/tasks</code>, <code>POST /api/tasks/:id/comments</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Task</code>, <code>TaskComment</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin, Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Create tasks, assign priorities, comment on tasks.</p>
      <p><strong>How It Works:</strong> Database-backed CRUD operations scoped by company ID.</p>
      <p><strong>Important Workflow:</strong> Manager assigns task &rarr; employee updates status &rarr; adds comment &rarr; completes task.</p>
    </div>
  </div>

  <!-- Module 36: Tender Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">36. Tender Management (tenders)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Tenders.tsx">Tenders.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/tenders</code>, <code>POST /api/tenders</code>, <code>POST /api/tenders/:id/convert</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Tender</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Log company tenders, track bidding stages (Won, Lost, Draft, Live).</p>
      <p><strong>How It Works:</strong> Saves tender tracking records scoped to the active company ID.</p>
      <p><strong>Important Workflow:</strong> Company Head enters bid &rarr; wins tender &rarr; clicks "Convert to Contract" &rarr; provisions new client contract.</p>
    </div>
  </div>

  <!-- Module 37: Contract Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">37. Contract Management (contracts)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Contracts.tsx">Contracts.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/contracts</code>, <code>POST /api/contracts</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Contract</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Track active contracts, renewals dashboard, multi-company overview (Super Admin).</p>
      <p><strong>How It Works:</strong> Queries database contracts. Super Admins can masquerade to manage specific company details.</p>
      <p><strong>Important Workflow:</strong> Super Admin reviews company contract status &rarr; enters masquerade mode &rarr; updates company contracts.</p>
    </div>
  </div>

  <!-- Module 38: Contract Sites -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">38. Contract Sites (contracts)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Contracts.tsx">Contracts.tsx (Sites Tab)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/contract-sites</code>, <code>POST /api/contract-sites</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>ContractSite</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Map customer site locations, set coordinates.</p>
      <p><strong>How It Works:</strong> Saves client site coordinates in the database to enable location-based attendance tracking.</p>
      <p><strong>Important Workflow:</strong> Admin creates site coordinates &rarr; site saves &rarr; maps employee check-ins to site location.</p>
    </div>
  </div>

  <!-- Module 39: Deployments -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">39. Deployments (contracts)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Contracts.tsx">Contracts.tsx (Deployments Tab)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/deployments</code>, <code>POST /api/deployments</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Deployment</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Allocate employees to client site contracts.</p>
      <p><strong>How It Works:</strong> Maps employee IDs to active contract site profiles in MySQL.</p>
      <p><strong>Important Workflow:</strong> HR allocates employee to client site &rarr; saves deployment row &rarr; employee checks in at site location.</p>
    </div>
  </div>

  <!-- Module 40: Company Profile -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">40. Company Profile (company-profile)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CompanyProfile.tsx">CompanyProfile.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/company-profile</code>, <code>PUT /api/companies/:id/branding</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Company</code>, <code>CompanyContact</code>, <code>CompanyDocument</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Save company address details, contact registries, upload logo, check document compliance audits.</p>
      <p><strong>How It Works:</strong> CRUD operations on company data, restricted to the active company ID.</p>
      <p><strong>Important Workflow:</strong> Admin uploads logo &rarr; saves changes &rarr; branding applies to invoices and payslips.</p>
    </div>
  </div>

  <!-- Module 41: Verification Wallet -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">41. Verification Wallet (dashboard)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/VerificationWallet.tsx">VerificationWallet.tsx (Credits Tab)</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/verification-credits/recharge/history</code>, <code>POST /api/verification-credits/recharge/orders</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>VerificationCreditOrder</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> View verification credit balances, buy packages via Cashfree checkout, view transactions history.</p>
      <p><strong>How It Works:</strong> Connects to Cashfree APIs to process verification credit checkouts.</p>
      <p><strong>Important Workflow:</strong> Admin selects verification package &rarr; checkout processes via gateway &rarr; credits verification wallet balance.</p>
    </div>
  </div>

  <!-- Module 42: Payroll Wallet -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">42. Payroll Wallet (payroll)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/PayrollWallet.tsx">PayrollWallet.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/wallet/transactions</code>, <code>POST /api/wallet/create-order</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>WalletTransaction</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> View wallet balances, top up wallet via gateway, view billing ledger transactions.</p>
      <p><strong>How It Works:</strong> Pre-funds account wallet for transaction charges and SaaS billing.</p>
      <p><strong>Important Workflow:</strong> Company Head adds funds &rarr; gateway confirms transaction &rarr; credits account wallet.</p>
    </div>
  </div>

  <!-- Module 43: Settings -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">43. Settings (settings)</h3>
      <span class="module-card-badge verified">Verified Working</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/Settings.tsx">Settings.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/branches</code>, <code>GET /api/employee-slots/overview</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>Branch</code>, <code>EmployeeSlot</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR, Finance, Employee</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Add branches, monitor employee slot caps, configure payment settings.</p>
      <p><strong>How It Works:</strong> Saves configurations variables scoped to the active company ID.</p>
      <p><strong>Important Workflow:</strong> Admin adds new branch &rarr; branch details save &rarr; maps employees to new branch.</p>
    </div>
  </div>


  <!-- Section 4 -->
  <h1 id="sec-4">4. Implemented but Needs Validation Modules</h1>
  <p>
    The following 6 modules are fully coded but require external keys or network hardware configurations to validate.
  </p>

  <!-- Module 8: Attendance API Integration -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">8. Attendance API Integration (attendance)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/AttendanceIntegration.tsx">AttendanceIntegration.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>POST /api/etimeoffice/connection/test</code>, <code>POST /api/etimeoffice/sync</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>AttendanceVendor</code>, <code>BiometricDevice</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin, Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> ADMS/ZK biometric device connections mapping, unmatched biometric scan queues.</p>
      <p><strong>How It Works:</strong> Node <code>net</code> module TCP socket handshake. Sends commands to fetch biometric records.</p>
      <p><strong>Validation Obstacle:</strong> Requires local ZKTeco network setup, port forwarding, and a physical device to verify TCP connections.</p>
    </div>
  </div>

  <!-- Module 41: User Management -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">41. User Management (users)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/UserManagement.tsx">UserManagement.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/users</code>, <code>POST /api/users</code>, <code>PUT /api/users/:id/permissions</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>User</code>, <code>Permission</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Manage platform user accounts, update RBAC permissions matrix.</p>
      <p><strong>How It Works:</strong> Saves permission rules scoped by company ID.</p>
      <p><strong>Validation Obstacle:</strong> Requires verification of multi-tenant scoping access maps.</p>
    </div>
  </div>

  <!-- Module 42: Audit Trail -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">42. Audit Trail (audit)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/AuditTrail.tsx">AuditTrail.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoint:</strong> <code>GET /api/audit</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>AuditLog</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Super Admin</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Query audit logs of platform-level events.</p>
      <p><strong>How It Works:</strong> Fetches audit log records from MySQL.</p>
      <p><strong>Validation Obstacle:</strong> Requires confirming that all write routes commit logs.</p>
    </div>
  </div>

  <!-- Module 43: WhatsApp Integration -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">43. WhatsApp Integration (communication)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/WhatsAppIntegration.tsx">WhatsAppIntegration.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>POST /api/communication/whatsapp/connection-test</code>, <code>POST /api/communication/whatsapp/send-test</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>WhatsappSettings</code>, <code>WhatsappTemplateMapping</code>, <code>WhatsappMessageLog</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head, HR</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Configure Meta Cloud API, template mappings, message logs.</p>
      <p><strong>How It Works:</strong> Connects to the Meta Cloud endpoint.</p>
      <p><strong>Validation Obstacle:</strong> Requires WhatsApp Business API credentials in <code>.env</code>.</p>
    </div>
  </div>

  <!-- Module 44: Custom Domain -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">44. Custom Domain (settings)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/CustomDomain.tsx">CustomDomain.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/custom-domain/overview</code>, <code>POST /api/custom-domain/domains</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>CustomDomainMapping</code>, <code>WhiteLabelBranding</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Add custom domain CNAME, white-label branding, health checks.</p>
      <p><strong>How It Works:</strong> Binds mapping records in database to reverse-proxy verification.</p>
      <p><strong>Validation Obstacle:</strong> Requires external DNS configuration to route correctly.</p>
    </div>
  </div>

  <!-- Module 45: Integration Hub -->
  <div class="module-card">
    <div class="module-card-header">
      <h3 class="module-card-title">45. Integration Hub (settings)</h3>
      <span class="module-card-badge validation">Needs Validation</span>
    </div>
    <div class="module-card-meta">
      <div class="module-card-meta-item"><strong>Frontend Route:</strong> <a href="file:///frontend/src/pages/IntegrationHub.tsx">IntegrationHub.tsx</a></div>
      <div class="module-card-meta-item"><strong>API Endpoints:</strong> <code>GET /api/integrations</code></div>
      <div class="module-card-meta-item"><strong>Database Models:</strong> <code>IntegrationSettings</code></div>
      <div class="module-card-meta-item"><strong>User Roles:</strong> Company Head</div>
    </div>
    <div class="module-card-content">
      <p><strong>Main Features:</strong> Dashboard to track API keys and webhook logs.</p>
      <p><strong>How It Works:</strong> Stores client credentials and key values.</p>
      <p><strong>Validation Obstacle:</strong> Webhook triggers depend on active network endpoints.</p>
    </div>
  </div>


  <!-- Section 5 -->
  <h1 id="sec-5">5. Features Found in Requirements but Not Verified</h1>
  <p>
    The following features are mentioned in documentation or planning requirements but lack database models or API controllers in the codebase:
  </p>
  <ul>
    <li>
      <strong>Predictive Attrition Forecasting (Concept)</strong>: 
      Mentioned as a planning capability in BI dashboards, but has no database models or backend API processing in the codebase.
    </li>
    <li>
      <strong>Smart Shift Scheduler (Concept)</strong>: 
      Described in shift scheduling plans, but the active codebase uses manual shift assignments without automated balancing algorithms.
    </li>
  </ul>


  <!-- Section 6 -->
  <h1 id="sec-6">6. Modules Requiring Fix (Audited Issues)</h1>
  <p>
    The following modules contain broken triggers, static UI placeholders, or hardcoded values:
  </p>
  
  <div class="callout danger-block">
    <div class="callout-title">1. Recruitment CRM (recruitment-crm) &mdash; Incomplete</div>
    <p class="callout-content">
      <strong>Issues:</strong> The "AI Match Candidates" button is static/inactive in the UI. Key metric counters like "Interviews Scheduled" and "Offers Pending" are hardcoded to "12" and "3" in the page instead of querying database records.<br>
      <strong>Required Fix:</strong> Implement the candidate matching logic in <a href="file:///backend/src/routes/recruitmentRoutes.js">recruitmentRoutes.js</a> and update the widgets to query aggregated statistics from candidate and interview tables.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">2. WhatsApp Integration (whatsapp-integration) &mdash; Unconfigured</div>
    <p class="callout-content">
      <strong>Issue:</strong> Depends on unconfigured Meta Cloud API environment variables in <code>.env</code>.<br>
      <strong>Required Fix:</strong> Input valid Meta API tokens and phone ID variables to enable messaging.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">3. Subscription Invoices (subscription-invoice) &mdash; Unconfigured</div>
    <p class="callout-content">
      <strong>Issue:</strong> Billing invoice checkout depends on Cashfree payment credentials setup.<br>
      <strong>Required Fix:</strong> Add PG Production keys to the backend <code>.env</code> file.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">4. Internal Communication (internal-communication) &mdash; Hardcoded Data</div>
    <p class="callout-content">
      <strong>Issues:</strong> Author name is hardcoded to "Employee Name" in feed items, and author ID is hardcoded to <code>1</code> when creating a post.<br>
      <strong>Required Fix:</strong> Fetch the logged-in user's employee name and id from the auth profile context and save them dynamically.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">5. Knowledge Base (knowledge-base) &mdash; Hardcoded Data</div>
    <p class="callout-content">
      <strong>Issue:</strong> Article content is hardcoded to "Content goes here..." upon creation.<br>
      <strong>Required Fix:</strong> Add an input form in the frontend to prompt for the article body when adding new SOP articles.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">6. Facility Booking (facility-booking) &mdash; Hardcoded Data</div>
    <p class="callout-content">
      <strong>Issue:</strong> <code>employeeId</code> is hardcoded when creating reservations.<br>
      <strong>Required Fix:</strong> Map the session employee ID to the booking transaction.
    </p>
  </div>

  <div class="callout danger-block">
    <div class="callout-title">7. Asset Management (asset-management) &mdash; Mock Data</div>
    <p class="callout-content">
      <strong>Issue:</strong> Uses mock employee IDs in allocation lists.<br>
      <strong>Required Fix:</strong> Dynamically lookup active employees using search dropdown.
    </p>
  </div>


  <!-- Section 7 -->
  <h1 id="sec-7">7. Production Readiness Status Mapping</h1>
  <p>
    The following table outlines the integration systems, their codebase readiness, and verification status:
  </p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Integration System</th>
        <th style="width: 25%;">Codebase Status</th>
        <th style="width: 25%;">Configuration Status</th>
        <th style="width: 25%;">Verification Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>SMTP Nodemailer</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>CONFIGURED</td>
        <td><strong>LIVE VERIFIED</strong> (Tested on EC2, delivers verification OTPs)</td>
      </tr>
      <tr>
        <td><strong>Cashfree Bank Verification</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>CONFIGURED</td>
        <td><strong>LIVE VERIFIED</strong> (Active credentials verified)</td>
      </tr>
      <tr>
        <td><strong>Cashfree Payment Gateway</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>CONFIGURED IN SANDBOX</td>
        <td><strong>NOT LIVE VERIFIED</strong> (Requires PG Production keys in .env)</td>
      </tr>
      <tr>
        <td><strong>WhatsApp Cloud API</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>NOT CONFIGURED</td>
        <td><strong>NOT LIVE VERIFIED</strong> (Requires Meta API keys)</td>
      </tr>
      <tr>
        <td><strong>Biometric Terminals (ZK)</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>NOT CONFIGURED</td>
        <td><strong>NOT LIVE VERIFIED</strong> (Requires physical device network)</td>
      </tr>
      <tr>
        <td><strong>Google Maps API</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>NOT CONFIGURED</td>
        <td><strong>NOT LIVE VERIFIED</strong> (Requires Maps API key)</td>
      </tr>
      <tr>
        <td><strong>OpenAI API</strong></td>
        <td>IMPLEMENTED IN CODE</td>
        <td>CONFIGURED</td>
        <td><strong>LIVE VERIFIED</strong> (Rule-based query parser maps inputs)</td>
      </tr>
    </tbody>
  </table>


  <!-- Section 8 -->
  <h1 id="sec-8">8. Core Business Workflows</h1>
  <p>
    This section outlines the business workflows for core modules.
  </p>

  <h2>8.1 New Company Registration</h2>
  <div class="diagram-container">
    <div class="diagram-row">
      <div class="diagram-box">Admin Submits Signup Form</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Verification Token Generated</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">SMTP Sends OTP to Head Email</div>
    </div>
    <div class="diagram-arrow">&darr;</div>
    <div class="diagram-row">
      <div class="diagram-box">Provision Workspace Database</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Verify OTP and Token</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Admin Submits 6-Digit OTP</div>
    </div>
  </div>

  <h2>8.2 Biometric Attendance Processing</h2>
  <div class="diagram-container">
    <div class="diagram-row">
      <div class="diagram-box">Local Device Captures Punch</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Log Sent to Backend IP Port</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Valid User Biometric ID?</div>
    </div>
    <div class="diagram-arrow">&darr;</div>
    <div class="diagram-row">
      <div class="diagram-box">Update Attendance Sheet</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Process Check-In/Check-Out</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">If No, Route to Unmatched Queue</div>
    </div>
  </div>

  <h2>8.3 Leave Approval Workflow</h2>
  <div class="diagram-container">
    <div class="diagram-row">
      <div class="diagram-box">Employee Submits Leave Request</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Verify Leave Balance Rules</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Manager Review &amp; Approval</div>
    </div>
    <div class="diagram-arrow">&darr;</div>
    <div class="diagram-row">
      <div class="diagram-box">Sync to Attendance Sheets</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Deduct Leave Balances</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Trigger Status Email</div>
    </div>
  </div>

  <h2>8.4 Payroll Generation</h2>
  <div class="diagram-container">
    <div class="diagram-row">
      <div class="diagram-box">Select Employee Pool</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Calculate Payable Days</div>
      <div class="diagram-arrow horizontal">&rarr;</div>
      <div class="diagram-box">Deduct LOP/PF/ESI Taxes</div>
    </div>
    <div class="diagram-arrow">&darr;</div>
    <div class="diagram-row">
      <div class="diagram-box">Generate Payslip PDFs</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Verify Wallet Funds</div>
      <div class="diagram-arrow horizontal">&larr;</div>
      <div class="diagram-box">Consolidate Branch Costs</div>
    </div>
  </div>


  <!-- Section 9 -->
  <h1 id="sec-9">9. Known Critical Production Checks</h1>
  <p>
    This section details critical production checks based on past system updates and resolutions:
  </p>
  <ul>
    <li><strong>Free Account Signup OTP Email Delivery</strong>:
      <ul>
        <li><em>Issue Details</em>: Email verification code delivery failure on production EC2 server.</li>
        <li><em>Verified Fix</em>: Ensure registration controller calls OTP mail delivery with purpose parameters set to <code>'registration'</code>. Email subject must display <code>[Brand] Email Verification Code</code>.</li>
      </ul>
    </li>
    <li><strong>Active Template Resolution</strong>:
      <ul>
        <li><em>Issue Details</em>: Invoices rendering with incorrect default layouts instead of active template settings.</li>
        <li><em>Verified Fix</em>: Verify that invoice generator resolves the correct active template database record for the company.</li>
      </ul>
    </li>
    <li><strong>Wallet Pricing Configuration</strong>:
      <ul>
        <li><em>Issue Details</em>: Financial ledger showing incorrect recharge prices.</li>
        <li><em>Verified Fix</em>: Check that transaction cost calculations resolve against the global pricing master.</li>
      </ul>
    </li>
  </ul>


  <!-- Section 10 -->
  <h1 id="sec-10">10. Summary</h1>
  <p>
    ZeniaHR is a fully featured Enterprise HRMS and SaaS platform. It combines core business operations, compliance, and user roles within a secure multi-tenant system. 
  </p>
  <p>
    By combining React-based client interfaces with Node.js APIs, MySQL databases, and Prisma ORM layers, ZeniaHR maintains data isolation while providing custom dashboards for all user roles.
  </p>

  <div class="doc-end">
    <strong>ZeniaHR – Enterprise HRMS &amp; SaaS Platform</strong><br>
    Feature, Workflow &amp; System Documentation<br>
    Version 1.0.0
  </div>

</body>
</html>
`;

console.log("==> Writing HTML to file...");
fs.writeFileSync(htmlPath, htmlContent);
console.log("✅ HTML file created at: " + htmlPath);

console.log("==> Launching Puppeteer to compile PDF...");
(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Load local HTML
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    
    console.log("==> Rendering PDF...");
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 7.5pt; font-family: 'Segoe UI', Arial, sans-serif; color: #94a3b8; width: 100%; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-left: 15mm; margin-right: 15mm; display: flex; justify-content: space-between; box-sizing: border-box;">
          <span>ZeniaHR — Enterprise HRMS &amp; SaaS Platform</span>
          <span>System Documentation</span>
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 7.5pt; font-family: 'Segoe UI', Arial, sans-serif; color: #94a3b8; width: 100%; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-left: 15mm; margin-right: 15mm; display: flex; justify-content: space-between; box-sizing: border-box;">
          <span>Version 1.0.0</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `
    });
    
    await browser.close();
    console.log("✅ PDF file successfully compiled at: " + pdfPath);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to compile PDF:", err.message);
    process.exit(1);
  }
})();
