import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ChevronLeft, Building2, User, Mail, Smartphone, CalendarDays, Crown, Wallet,
  Save, History as HistoryIcon, Receipt, CheckCircle2, Sparkles,
} from 'lucide-react';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { PLAN_CATALOG, pricePerEmployee, inr, type PlanKey, type BillingCycle } from '@/config/subscriptionPricing';
import { formatDateTime } from '@/utils/formatDate';

interface Props {
  companyId: string | number;
  onBack: () => void;
  onSaved?: () => void;
}

// Premium module keys a Custom plan can toggle (mirror of backend PREMIUM_MODULES).
const MODULE_LABELS: Record<string, string> = {
  communication: 'Communication Center', tasks: 'Task Manager', tenders: 'Tender Management',
  contracts: 'Contract Management', invoicing: 'Invoice Management', loans: 'Employee Loans',
  compliance: 'Statutory Compliance', 'custom-reports': 'Custom Report Builder',
};
const PLAN_VARIANT: Record<string, any> = { Free: 'gray', Starter: 'blue', Professional: 'purple', Enterprise: 'indigo', Custom: 'amber' };
const FREE_REPORTS = ['salary_register', 'salary_slip', 'payroll_summary', 'pf_register', 'leave_register', 'esi_register', 'bonus_register', 'wage_register'];

export const SubscriptionManage: React.FC<Props> = ({ companyId, onBack, onSaved }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Live plan catalog from the editable master store (falls back to the static
  // mirror) — so newly-created plans + edited prices appear here automatically.
  const [catalog, setCatalog] = useState<any[]>(PLAN_CATALOG as any[]);

  // Editable form state
  const [plan, setPlan] = useState<PlanKey>('Free');
  const [cycle, setCycle] = useState<BillingCycle>('Quarterly');
  const [discount, setDiscount] = useState(0);
  const [renewalDate, setRenewalDate] = useState('');
  const [reason, setReason] = useState('');
  // Custom-only
  const [customRate, setCustomRate] = useState(0);
  const [limits, setLimits] = useState({ employeeLimit: '', branchLimit: '', storageMB: '', adminUserLimit: '' });
  const [customModules, setCustomModules] = useState<string[]>([]);
  const [allReports, setAllReports] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, cat] = await Promise.all([
        api.subscriptions.get(companyId),
        api.subscriptions.catalog().catch(() => null),
      ]);
      if (cat?.plans?.length) setCatalog(cat.plans);
      setData(d);
      const s = d.subscription || {};
      setPlan(d.plan); setCycle(d.billingCycle); setDiscount(s.discountPercent || 0);
      setRenewalDate(s.renewalDate ? String(s.renewalDate).slice(0, 10) : '');
      setCustomRate(s.pricePerEmployee || 0);
      setLimits({
        employeeLimit: s.employeeLimit ?? '', branchLimit: s.branchLimit ?? '',
        storageMB: s.storageMB ?? '', adminUserLimit: s.adminUserLimit ?? '',
      });
      setCustomModules(Array.isArray(s.customModules) ? s.customModules : []);
      setAllReports(s.customReports == null || s.customReports === 'all');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const employees = data?.employees ?? 0;

  // Live auto-calculated amount (never entered manually). The per-employee rate
  // comes from the master catalog (edited prices reflected); Custom uses the
  // manual rate. Falls back to the static mirror if the catalog is unavailable.
  const liveRate = useMemo(() => {
    if (plan === 'Custom') return Number(customRate) || 0;
    const p = catalog.find((c) => c.key === plan);
    if (p) return Number(cycle === 'Yearly' ? p.yearly : p.quarterly) || 0;
    return pricePerEmployee(plan, cycle, customRate);
  }, [plan, cycle, customRate, catalog]);
  const liveAmount = useMemo(() => {
    const gross = (Number(employees) || 0) * liveRate;
    return Math.max(0, gross - Math.round(gross * ((Number(discount) || 0) / 100)));
  }, [employees, liveRate, discount]);

  const toggleModule = (key: string) =>
    setCustomModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { plan, billingCycle: cycle, discountPercent: discount, renewalDate: renewalDate || null, reason: reason || undefined };
      if (plan === 'Custom') {
        payload.pricePerEmployee = Number(customRate) || 0;
        payload.employeeLimit = limits.employeeLimit === '' ? null : Number(limits.employeeLimit);
        payload.branchLimit = limits.branchLimit === '' ? null : Number(limits.branchLimit);
        payload.storageMB = limits.storageMB === '' ? null : Number(limits.storageMB);
        payload.adminUserLimit = limits.adminUserLimit === '' ? null : Number(limits.adminUserLimit);
        payload.customModules = customModules;
        payload.customReports = allReports ? 'all' : FREE_REPORTS;
      }
      await api.subscriptions.update(companyId, payload);
      ui.toast.success('Subscription updated. Permissions refresh automatically for the company.');
      await load();
      onSaved?.();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const dirty = data && (plan !== data.plan || cycle !== data.billingCycle || (data.subscription?.discountPercent || 0) !== discount || plan === 'Custom');

  const input = 'w-full h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
  const label = 'text-[11px] font-bold text-ink-secondary uppercase tracking-wider';

  const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label: l, value }) => (
    <div className="flex items-center gap-3 py-2">
      <span className="text-ink-muted">{icon}</span>
      <span className="text-[13px] text-ink-secondary w-32">{l}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );

  if (loading) return <div className="p-6"><div className="animate-pulse text-ink-muted text-sm">Loading subscription…</div></div>;
  if (!data) return <div className="p-6 text-ink-muted text-sm">Subscription not found.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-ink-secondary hover:text-brand-600 transition"><ChevronLeft size={17} /> Back to Subscriptions</button>
        <Button icon={<Save size={15} />} onClick={save} loading={saving} disabled={!dirty}>Save Changes</Button>
      </div>
      <div>
        <h1 className="text-xl font-extrabold text-ink font-heading tracking-tight flex items-center gap-2">{data.companyName}
          <Badge variant={PLAN_VARIANT[plan] || 'gray'}>{plan === 'Custom' && <Crown size={11} />}{plan}</Badge>
          <Badge variant={statusBadge(data.status)} dot>{data.status}</Badge>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Company Information */}
        <Card>
          <SectionHeader title="Company Information" />
          <InfoRow icon={<Building2 size={15} />} label="Company" value={data.companyName} />
          <InfoRow icon={<User size={15} />} label="Company Head" value={data.companyHead} />
          <InfoRow icon={<Mail size={15} />} label="Email" value={data.companyHeadEmail || '—'} />
          <InfoRow icon={<Smartphone size={15} />} label="Mobile" value={data.companyMobile || '—'} />
          <InfoRow icon={<CalendarDays size={15} />} label="Created" value={data.createdDate ? formatDateTime(data.createdDate).split(',')[0] : '—'} />
        </Card>

        {/* Current Subscription */}
        <Card>
          <SectionHeader title="Current Subscription" />
          <InfoRow icon={<Crown size={15} />} label="Plan" value={<Badge variant={PLAN_VARIANT[data.plan] || 'gray'}>{data.plan}</Badge>} />
          <InfoRow icon={<CheckCircle2 size={15} />} label="Status" value={<Badge variant={statusBadge(data.status)} dot>{data.status}</Badge>} />
          <InfoRow icon={<CalendarDays size={15} />} label="Billing Cycle" value={data.billingCycle} />
          <InfoRow icon={<User size={15} />} label="Employees" value={data.employees} />
          <InfoRow icon={<Building2 size={15} />} label="Branches" value={data.branches} />
          <InfoRow icon={<Wallet size={15} />} label="Amount" value={inr(data.amount)} />
        </Card>

        {/* Change Plan + live amount */}
        <Card className="lg:row-span-1">
          <SectionHeader title="Change Plan" />
          <div className="space-y-3">
            <div>
              <label className={label}>Plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)} className={`${input} mt-1`}>
                {catalog.map((p) => <option key={p.key} value={p.key}>{p.label} — {p.range}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Billing Cycle</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['Quarterly', 'Yearly'] as BillingCycle[]).map((c) => (
                  <button key={c} onClick={() => setCycle(c)} className={`h-10 rounded-xl border text-sm font-bold transition-colors ${cycle === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-hairline text-ink-secondary hover:bg-surface-muted'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={label}>Discount %</label>
              <input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${input} mt-1`} />
            </div>
            {/* Live auto-calculation */}
            <div className="rounded-2xl bg-brand-50/60 border border-brand-100 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-700 uppercase tracking-wider"><Sparkles size={13} /> Auto-calculated</div>
              <div className="mt-1.5 text-[13px] text-ink-secondary">
                {plan === 'Free' ? 'Free plan — no charge.' : <>{employees} employees × {inr(liveRate)}{discount ? ` − ${discount}%` : ''}</>}
              </div>
              <div className="text-3xl font-extrabold text-ink mt-1 tabular-nums">{inr(liveAmount)}<span className="text-sm font-semibold text-ink-muted"> / {cycle === 'Yearly' ? 'year' : 'quarter'}</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Custom plan configuration */}
      {plan === 'Custom' && (
        <Card>
          <SectionHeader title="Custom Plan Configuration" subtitle="Manually set pricing, limits and exactly which modules & reports are enabled." />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className={label}>Price / Employee</label><input type="number" min={0} value={customRate} onChange={(e) => setCustomRate(Number(e.target.value) || 0)} className={`${input} mt-1`} /></div>
            <div><label className={label}>Employee Limit</label><input type="number" min={0} value={limits.employeeLimit} onChange={(e) => setLimits((l) => ({ ...l, employeeLimit: e.target.value }))} placeholder="Unlimited" className={`${input} mt-1`} /></div>
            <div><label className={label}>Branch Limit</label><input type="number" min={0} value={limits.branchLimit} onChange={(e) => setLimits((l) => ({ ...l, branchLimit: e.target.value }))} placeholder="Unlimited" className={`${input} mt-1`} /></div>
            <div><label className={label}>Storage (MB)</label><input type="number" min={0} value={limits.storageMB} onChange={(e) => setLimits((l) => ({ ...l, storageMB: e.target.value }))} placeholder="Unlimited" className={`${input} mt-1`} /></div>
            <div><label className={label}>Admin Users</label><input type="number" min={0} value={limits.adminUserLimit} onChange={(e) => setLimits((l) => ({ ...l, adminUserLimit: e.target.value }))} placeholder="Unlimited" className={`${input} mt-1`} /></div>
          </div>
          <div className="mt-4">
            <label className={label}>Enabled Modules</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {Object.entries(MODULE_LABELS).map(([key, lbl]) => (
                <label key={key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-[13px] ${customModules.includes(key) ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-hairline text-ink-secondary'}`}>
                  <input type="checkbox" checked={customModules.includes(key)} onChange={() => toggleModule(key)} className="accent-brand-600" />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className={label}>Enabled Reports</label>
            <label className="flex items-center gap-2 mt-2 text-[13px] text-ink-secondary">
              <input type="checkbox" checked={allReports} onChange={(e) => setAllReports(e.target.checked)} className="accent-brand-600" />
              Allow all reports {allReports ? '' : '(restricted to the standard payroll/statutory set)'}
            </label>
          </div>
        </Card>
      )}

      {/* Subscription History + Billing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card padding={false} className="lg:col-span-2">
          <div className="px-5 pt-5"><SectionHeader title="Subscription History" /></div>
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Date</Th><Th>Changed By</Th><Th>Old Plan</Th><Th>New Plan</Th><Th>Old Amount</Th><Th>New Amount</Th><Th>Reason</Th></Tr></Thead>
              <Tbody>
                {(data.history || []).length === 0 ? (
                  <Tr><Td colSpan={7}><div className="py-8 text-center text-ink-muted text-sm">No changes yet.</div></Td></Tr>
                ) : data.history.map((h: any) => (
                  <Tr key={h.id}>
                    <Td className="text-[12px]">{formatDateTime(h.createdAt)}</Td>
                    <Td>{h.changedBy || '—'}</Td>
                    <Td>{h.oldPlan || '—'}</Td>
                    <Td><span className="font-semibold">{h.newPlan || '—'}</span></Td>
                    <Td className="tabular-nums">{h.oldAmount != null ? inr(h.oldAmount) : '—'}</Td>
                    <Td className="tabular-nums">{h.newAmount != null ? inr(h.newAmount) : '—'}</Td>
                    <Td className="max-w-[220px] truncate" >{h.reason || '—'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>

        {/* Billing */}
        <Card>
          <SectionHeader title="Billing" />
          <div className="space-y-2.5">
            <InfoRow icon={<Wallet size={15} />} label="Current Amount" value={inr(data.billing?.currentAmount ?? data.amount)} />
            <InfoRow icon={<CalendarDays size={15} />} label="Cycle" value={data.billingCycle} />
            <InfoRow icon={<Receipt size={15} />} label="Payment" value={<Badge variant={statusBadge(data.billing?.paymentStatus || data.paymentStatus)}>{data.billing?.paymentStatus || data.paymentStatus}</Badge>} />
            <InfoRow icon={<CalendarDays size={15} />} label="Renewal" value={data.billing?.renewalDate ? formatDateTime(data.billing.renewalDate).split(',')[0] : '—'} />
            <InfoRow icon={<HistoryIcon size={15} />} label="Outstanding" value={data.billing?.outstanding ? <Badge variant="red">Yes</Badge> : <Badge variant="green">None</Badge>} />
          </div>
          <div className="mt-4 pt-3 border-t border-hairline">
            <label className={label}>Renewal date</label>
            <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className={`${input} mt-1`} />
          </div>
          <div className="mt-3">
            <label className={label}>Reason (for history)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Upgraded on customer request" className={`${input} mt-1`} />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionManage;
