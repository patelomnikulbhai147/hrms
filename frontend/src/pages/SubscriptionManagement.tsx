// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT (Super Admin) — the platform's commercial control room.
//
// Six sections, in the order the business actually asks its questions:
//
//   Overview   — how are we doing?      (4 figures + revenue & plan-mix charts)
//   Companies  — who is on what?        (one simplified row per company)
//   Plans      — what do we sell?       (plan cards + the master plan editor)
//   Billing    — where is the money?    (payments · invoices · refunds ·
//                                        revenue · pending · failed)
//   Reports    — what does it tell us?  (revenue · growth · renewals · expired ·
//                                        credit sales · slot sales · GST)
//   Settings   — how does it run?       (GST · gateway · invoice template ·
//                                        billing rules · pricing matrix · coupons)
//
// Clicking a company opens its full Company Subscription Details page.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  LayoutDashboard, Building2, Layers, ReceiptText, FileBarChart2, SlidersHorizontal, Crown, Globe,
} from 'lucide-react';
import { WhiteLabelTab } from '@/components/subscription/WhiteLabelTab';
import { OverviewTab } from '@/components/subscription/OverviewTab';
import { CompaniesTab } from '@/components/subscription/CompaniesTab';
import { PlansTab } from '@/components/subscription/PlansTab';
import { BillingTab } from '@/components/subscription/BillingTab';
import { ReportsTab } from '@/components/subscription/ReportsTab';
import { SettingsTab } from '@/components/subscription/SettingsTab';

interface Props {
  /** Opens the full-page Company Subscription Details view. */
  onManage: (companyId: string | number) => void;
  /** Opens the dedicated full-page Subscription Invoice (never a modal). */
  onOpenInvoice?: (invoiceId: string | number) => void;
}

type TabKey = 'overview' | 'companies' | 'plans' | 'billing' | 'reports' | 'whitelabel' | 'settings';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
  { key: 'companies', label: 'Companies', icon: <Building2 size={15} /> },
  { key: 'plans', label: 'Plans', icon: <Layers size={15} /> },
  { key: 'billing', label: 'Billing', icon: <ReceiptText size={15} /> },
  { key: 'reports', label: 'Reports', icon: <FileBarChart2 size={15} /> },
  { key: 'whitelabel', label: 'White Label', icon: <Globe size={15} /> },
  { key: 'settings', label: 'Settings', icon: <SlidersHorizontal size={15} /> },
];

export const SubscriptionManagement: React.FC<Props> = ({ onManage, onOpenInvoice }) => {
  const [tab, setTab] = useState<TabKey>('overview');
  // Set when a tile on Overview deep-links into a specific register/report.
  const [billingView, setBillingView] = useState<any>(undefined);
  const [reportView, setReportView] = useState<any>(undefined);

  const goto = (next: string, view?: string) => {
    if (next === 'billing') setBillingView(view);
    if (next === 'reports') setReportView(view);
    setTab(next as TabKey);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Master header */}
      <div>
        <h1 className="text-xl font-bold text-ink font-heading tracking-tight flex items-center gap-2">
          <Crown size={20} className="text-brand-600" /> Subscription Management
        </h1>
        <p className="text-[13px] text-ink-secondary mt-1">
          Plans, pricing, billing and entitlements for every company on the platform.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-hairline overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-3 text-[13.5px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab onGoto={goto} />}
      {tab === 'companies' && <CompaniesTab onOpen={onManage} />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'billing' && <BillingTab onOpenInvoice={onOpenInvoice} initialView={billingView} />}
      {tab === 'reports' && <ReportsTab initialView={reportView} />}
      {tab === 'whitelabel' && <WhiteLabelTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
};

export default SubscriptionManagement;
