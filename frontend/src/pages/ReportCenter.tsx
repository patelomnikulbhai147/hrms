import React, { useMemo, useState } from 'react';
import {
  Search, ChevronDown, ChevronRight, FileText, Users, CalendarCheck, CalendarDays,
  DollarSign, ShieldCheck, Activity, CreditCard, Wallet, Briefcase, Building2,
  BarChart3, ClipboardList, ArrowLeft
} from 'lucide-react';
import { type Employee, type AttendanceRecord, type LeaveRequest, type PayrollRecord, type Role, type Company } from '@/data/mockData';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Reports } from '@/pages/Reports';

interface ReportCenterProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  payroll: PayrollRecord[];
  leaves: LeaveRequest[];
}

type Group = 'employee' | 'attendance' | 'payroll' | 'leave' | 'document' | 'compliance';

interface ReportCategory {
  id: string;
  title: string;
  group: Group;
  icon: React.ReactNode;
  reports: string[];
}

// ── Phase 1: catalog only (display). No generation logic is wired here. ───────
const CATEGORIES: ReportCategory[] = [
  {
    id: 'employee', title: 'Employee Reports', group: 'employee', icon: <Users size={16} />,
    reports: [
      'Employee Information Form', 'Employee Directory', 'Employee Attendance Report',
      'Employee Monthly Attrition Report', 'Birthday Report', 'Age Wise Report', 'Left Join Report',
      'Full & Final Report', 'Service Certificate Report', 'Employee Pending Document Report',
      'Employee Document Status Report', 'Employee KYC Report', 'Identity Card Register', 'Employee Master Report',
    ],
  },
  {
    id: 'attendance', title: 'Attendance Reports', group: 'attendance', icon: <CalendarCheck size={16} />,
    reports: [
      'Daily Attendance', 'Weekly Attendance', 'Monthly Attendance', 'Attendance Register',
      'Missing Punch Report', 'Late Coming Report', 'Early Exit Report', 'Shift Attendance Report',
      'Overtime Register Report', 'Overtime Summary Report', 'Muster Report',
    ],
  },
  {
    id: 'payroll', title: 'Payroll Reports', group: 'payroll', icon: <DollarSign size={16} />,
    reports: [
      'Salary Register', 'Salary Slip', 'Salary Slip TDS', 'Salary Slip Direct Mail', 'Salary Slip Multi Download',
      'Payment Report', 'Salary Certificate', 'Department Salary Summary', 'Employee Monthly Salary Summary',
      'Employee Annual Salary Summary', 'Company Annual Salary Summary', 'Division Summary', 'Increment Report',
    ],
  },
  {
    id: 'leave', title: 'Leave Reports', group: 'leave', icon: <CalendarDays size={16} />,
    reports: [
      'Leave Detail Report', 'Leave Encashment Report', 'Leave Application Report',
      'Leave Balance Report', 'Leave Summary Report',
    ],
  },
  {
    id: 'document', title: 'Document Reports', group: 'document', icon: <FileText size={16} />,
    reports: [
      'Aadhaar Report', 'PAN Report', 'Passport Report', 'Driving License Report', 'Bank Document Report',
      'Education Document Report', 'Experience Document Report', 'Contract Document Report',
      'Uploaded Documents Register', 'Employee Pending Documents Report',
    ],
  },
  {
    id: 'pf', title: 'PF Reports', group: 'compliance', icon: <ShieldCheck size={16} />,
    reports: [
      'PF Register Report', 'Company PF Summary Report', 'PF Challan Monthly', 'Form 5 Monthly', 'Form 10 Monthly',
      'Form 11 PF', 'Form 3A', 'Form 6A Part I', 'Form 6A Part II', 'Form 9 Report', 'Form 19 Report',
      'Form 10C Report', 'PF Number Report', 'Employee PF Summary Report', 'PF Form 11 Report',
      'PF Inspection Report', 'PF Challan Entry',
    ],
  },
  {
    id: 'esi', title: 'ESI Reports', group: 'compliance', icon: <Activity size={16} />,
    reports: [
      'ESI Challan Monthly Report', 'ESI Register Report', 'Company ESI Summary', 'Employee ESI Summary',
      'ESI Number Report', 'ESI Inspection Report', 'ESI Challan Entry',
    ],
  },
  {
    id: 'tax', title: 'Professional Tax & Income Tax Reports', group: 'compliance', icon: <CreditCard size={16} />,
    reports: [
      'Professional Tax Summary', 'PT Challan Form 5 Report', 'PT Challan List', 'IT Return Form 16',
      'IT Declaration Form', 'TDS Report', 'Tax Deduction Report',
    ],
  },
  {
    id: 'bonus', title: 'Bonus & Gratuity Reports', group: 'compliance', icon: <Wallet size={16} />,
    reports: ['Bonus Register', 'Gratuity Calculation', 'Gratuity Statement', 'Gratuity Register'],
  },
  {
    id: 'labour', title: 'Labour Contract Reports', group: 'compliance', icon: <Briefcase size={16} />,
    reports: [
      'Form 13 Report', 'Form 24 Report', 'Form 25 Report', 'Form XX Loss Damages', 'Form XXI Fines Register',
      'Form XXII Advance Register', 'Employment Card', 'Overtime Register',
    ],
  },
  {
    id: 'factory', title: 'Factory Act Reports', group: 'compliance', icon: <Building2 size={16} />,
    reports: [
      'Form 15 II Wages Register', 'Accident Register Report', 'Compensatory Leave Register',
      'Form 20 Health Register', 'Form 32 Health Register', 'Form 28 Muster Roll', 'Form 37 Register',
      'Rest Leave Wages Register', 'Exempted Workers OT Register',
    ],
  },
];

export const ReportCenter: React.FC<ReportCenterProps> = (props) => {
  const [search, setSearch] = useState('');
  const [showClassic, setShowClassic] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();

  // Filter report names by search; a category is shown if it has matches.
  const filtered = useMemo(() => CATEGORIES.map(c => ({
    ...c,
    matches: q ? c.reports.filter(r => r.toLowerCase().includes(q)) : c.reports,
  })).filter(c => c.matches.length > 0), [q]);

  const totals = useMemo(() => {
    const totalReports = CATEGORIES.reduce((s, c) => s + c.reports.length, 0);
    const countByGroup = (g: Group) => CATEGORIES.filter(c => c.group === g).reduce((s, c) => s + c.reports.length, 0);
    return {
      categories: CATEGORIES.length,
      totalReports,
      employee: countByGroup('employee'),
      attendance: countByGroup('attendance'),
      payroll: countByGroup('payroll'),
      compliance: countByGroup('compliance'),
    };
  }, []);

  // When searching, force every visible category open; otherwise honor toggles.
  const isOpen = (id: string) => (q ? true : !collapsed.has(id));
  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allOpen = collapsed.size === 0;
  const toggleAll = () => setCollapsed(allOpen ? new Set(CATEGORIES.map(c => c.id)) : new Set());

  // Existing, working reports preserved — reachable via this toggle (req #8).
  if (showClassic) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Current Live Reports</h2>
          <Button variant="outline" icon={<ArrowLeft size={15} />} onClick={() => setShowClassic(false)}>Back to Report Center</Button>
        </div>
        <Reports {...props} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={18} className="text-indigo-600" /> Report Center</h2>
            <p className="text-xs text-slate-500">Enterprise HRMS reporting — browse every report by category. New generation engine rolling out soon.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</Button>
            <Button variant="outline" size="sm" icon={<FileText size={14} />} onClick={() => setShowClassic(true)}>Current Live Reports</Button>
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="max-w-md">
            <Input icon={<Search size={14} />} placeholder="Search report name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Dashboard summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Report Categories" value={totals.categories} icon={<BarChart3 size={16} />} color="bg-indigo-500" />
        <StatCard label="Total Reports" value={totals.totalReports} icon={<ClipboardList size={16} />} color="bg-slate-600" />
        <StatCard label="Employee Reports" value={totals.employee} icon={<Users size={16} />} color="bg-blue-500" />
        <StatCard label="Attendance Reports" value={totals.attendance} icon={<CalendarCheck size={16} />} color="bg-emerald-500" />
        <StatCard label="Payroll Reports" value={totals.payroll} icon={<DollarSign size={16} />} color="bg-amber-500" />
        <StatCard label="Compliance Reports" value={totals.compliance} icon={<ShieldCheck size={16} />} color="bg-violet-500" />
      </div>

      {/* Categories */}
      {filtered.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-slate-500">No reports match “{search}”.</p>
            <p className="text-xs text-slate-400 mt-1">Try a different keyword.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(cat => (
            <div key={cat.id} className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm overflow-hidden">
              <button
                onClick={() => toggle(cat.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600">{cat.icon}</span>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-slate-800">{cat.title}</h3>
                    <p className="text-[11px] text-slate-400">{cat.matches.length} report{cat.matches.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-slate-400">{isOpen(cat.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
              </button>

              {isOpen(cat.id) && (
                <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cat.matches.map(name => (
                    <div
                      key={name}
                      title="Coming soon"
                      aria-disabled="true"
                      className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 opacity-90 cursor-not-allowed select-none"
                    >
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-400 shrink-0">
                        <FileText size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 leading-snug">{name}</p>
                        <span className="inline-flex items-center mt-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportCenter;
