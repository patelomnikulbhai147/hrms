import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, User, CalendarCheck, DollarSign, Laptop, FileText, Target,
  BookOpen, ChevronRight, ArrowLeft, Building2, Phone, Mail, MapPin,
  Clock, TrendingUp, AlertCircle, CheckCircle, XCircle, Loader2,
  Calendar, Briefcase, Star, Award, Package, IdCard, Activity
} from 'lucide-react';
import { api } from '@/api/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface EmployeeSearchResult {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  profilePhoto: string | null;
  status: string;
  branch?: { branchName: string } | null;
}

interface AnalyticsData {
  employee: {
    id: number; employeeId: string; name: string; email: string; mobile: string;
    department: string; designation: string; profilePhoto: string | null; status: string;
    joinDate: string | null; workLocation: string | null; reportingManager: string | null; branch: string | null;
  };
  attendance: {
    totalDays: number; present: number; absent: number; halfDay: number; late: number;
    earlyLeave: number; attendancePct: string; avgWorkingHours: string;
  };
  leave: {
    totalUsed: number; pending: number; approved: number; rejected: number;
    byType: Record<string, { total: number; approved: number; pending: number; rejected: number }>;
  };
  payroll: {
    current: {
      month: number; year: number; basicSalary: number; grossSalary: number; netSalary: number;
      totalDeductions: number; pfEmployee: number; esiEmployee: number; tds: number; overtimePay: number;
    } | null;
    ytdNetSalary: number;
    history: any[];
  };
  assets: { assetCode: string; assetType: string; name: string; allocationDate: string | null; status: string; warrantyExpiry: string | null }[];
  documents: { documentType: string; verificationStatus: string; expiryDate: string | null; createdAt: string }[];
}

const DATE_RANGES = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last3Months', label: 'Last 3 Months' },
  { key: 'last6Months', label: 'Last 6 Months' },
  { key: 'thisYear', label: 'This Year' },
];

const TABS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'leave', label: 'Leave', icon: Calendar },
  { key: 'payroll', label: 'Payroll', icon: DollarSign },
  { key: 'assets', label: 'Assets', icon: Laptop },
  { key: 'documents', label: 'Documents', icon: FileText },
];

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color = 'indigo', icon: Icon }: any) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export const EmployeeSelfService = ({
  activeCompanyId,
  role,
  authProfile,
}: {
  activeCompanyId: string | null;
  role: string;
  authProfile: any;
}) => {
  // Mode determines whether we are showing the list of employees or the analytics for one employee
  const [mode, setMode] = useState<'list' | 'analytics'>('list');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchResult | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [dateRange, setDateRange] = useState('thisMonth');

  // Employee List state
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<EmployeeSearchResult[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canViewPayroll = role === 'Company Head' || role === 'HR' || role === 'Finance' || role === 'Super Admin';

  const loadEmployees = useCallback(async (q: string, p: number = 1) => {
    if (!activeCompanyId) return;
    setEmployeesLoading(true);
    try {
      // Use the newly secured /api/employees/search endpoint to fetch the list of authorized employees.
      // If q is empty, it acts as a normal 'get all' with strict company/branch isolation.
      const res: any = await api.get(`/api/employees/search`, {
        params: { q, companyId: activeCompanyId, page: p, limit: 25 },
      });
      const payload = res.data;
      setEmployees(payload?.data || []);
      setTotalPages(payload?.totalPages || 1);
      setTotalEmployees(payload?.total || 0);
    } catch (err: any) {
      console.error('[ESS] Failed to load employees:', err);
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, [activeCompanyId]);

  // Load employees when activeCompanyId changes
  useEffect(() => {
    if (activeCompanyId && mode === 'list') {
      loadEmployees(query, 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (mode === 'list') {
        setPage(1);
        loadEmployees(query, 1);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, loadEmployees, mode]);

  const loadAnalytics = useCallback(async (empId: number, dr: string) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res: any = await api.get(`/api/employees/${empId}/analytics`, {
        params: { dateRange: dr },
      });
      setAnalytics(res.data);
    } catch (err: any) {
      setAnalyticsError(err?.message || 'Failed to load employee analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const handleSelectEmployee = (emp: EmployeeSearchResult) => {
    setSelectedEmployee(emp);
    setMode('analytics');
    setActiveTab('profile');
    loadAnalytics(emp.id, dateRange);
  };

  const handleDateRangeChange = (dr: string) => {
    setDateRange(dr);
    if (selectedEmployee) loadAnalytics(selectedEmployee.id, dr);
  };

  const handleBack = () => {
    setMode('list');
    setSelectedEmployee(null);
    setAnalytics(null);
  };

  const initials = (name: string) =>
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const fmt = (n: number | null | undefined) =>
    typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : '—';

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // ── List mode ──────────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <User className="text-brand-500" size={26} /> Employee Analytics
            </h2>
            <p className="text-sm text-slate-500 mt-1">Search or select an employee to view their full analytics.</p>
          </div>
        </div>

        {/* Employee Search & List Container */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-12rem)]">
          
          {/* Search Header */}
          <div className="p-6 border-b border-slate-200 flex-shrink-0">
            <div className="relative max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search employees by name, ID, department..."
                className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-sm transition"
              />
              {employeesLoading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-500 animate-spin" size={16} />
              )}
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="mb-4 text-sm font-semibold text-slate-600 flex justify-between items-center">
              <span>Employees ({totalEmployees})</span>
            </div>

            {employees.length === 0 && !employeesLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <User className="mx-auto mb-3 text-slate-300" size={32} />
                <p>No employees found {query ? `for "${query}"` : ''}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handleSelectEmployee(emp)}
                    className="flex flex-col items-start bg-white rounded-xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-md transition text-left group"
                  >
                    <div className="flex items-center gap-4 w-full border-b border-slate-100 pb-4 mb-4">
                      {emp.profilePhoto ? (
                        <img src={emp.profilePhoto} alt={emp.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-slate-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-sm font-bold flex-shrink-0">
                          {initials(emp.name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 text-sm truncate group-hover:text-brand-600 transition">{emp.name}</p>
                        <p className="text-xs font-mono text-brand-500 font-medium">{emp.employeeId}</p>
                      </div>
                    </div>
                    <div className="w-full space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Briefcase size={14} className="text-slate-400" />
                        <span className="truncate">{emp.designation || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="truncate">{emp.department || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="truncate">{emp.branch?.branchName || 'N/A'}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { const p = Math.max(1, page - 1); setPage(p); loadEmployees(query, p); }}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); loadEmployees(query, p); }}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Analytics mode ──────────────────────────────────────────────────────────
  const emp = analytics?.employee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition font-medium bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm hover:border-brand-200"
        >
          <ArrowLeft size={16} /> Back to Employee List
        </button>
      </div>

      {/* Employee Profile Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {emp?.profilePhoto ? (
            <img src={emp.profilePhoto} alt={emp.name} className="w-20 h-20 rounded-2xl object-cover flex-shrink-0 border-2 border-brand-100" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 text-2xl font-black flex-shrink-0">
              {initials(emp?.name || selectedEmployee?.name || '?')}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{emp?.name || selectedEmployee?.name}</h2>
            <p className="text-sm text-slate-500">{emp?.designation || selectedEmployee?.designation || '—'} · {emp?.department || selectedEmployee?.department || '—'}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-xs font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{emp?.employeeId || selectedEmployee?.employeeId}</span>
              {emp?.status && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${emp.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {emp.status}
                </span>
              )}
              {emp?.branch && <span className="text-xs text-slate-400">{emp.branch}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Filter + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {TABS.filter(t => t.key !== 'payroll' || canViewPayroll).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === tab.key ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
        {(activeTab === 'attendance' || activeTab === 'leave' || activeTab === 'payroll') && (
          <div className="flex gap-1 flex-wrap">
            {DATE_RANGES.map(dr => (
              <button
                key={dr.key}
                onClick={() => handleDateRangeChange(dr.key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  dateRange === dr.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300'
                }`}
              >
                {dr.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {analyticsLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-brand-500" size={36} />
          <span className="ml-3 text-slate-500">Loading analytics…</span>
        </div>
      )}

      {/* Error */}
      {analyticsError && !analyticsLoading && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <AlertCircle className="text-rose-400 mx-auto mb-2" size={32} />
          <p className="text-rose-700 font-medium">{analyticsError}</p>
          <button
            onClick={() => selectedEmployee && loadAnalytics(selectedEmployee.id, dateRange)}
            className="mt-3 text-sm text-brand-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab Content */}
      {!analyticsLoading && !analyticsError && analytics && (
        <>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Full Name', value: emp?.name, icon: User },
                { label: 'Employee ID', value: emp?.employeeId, icon: IdCard },
                { label: 'Email', value: emp?.email, icon: Mail },
                { label: 'Mobile', value: emp?.mobile, icon: Phone },
                { label: 'Department', value: emp?.department, icon: Building2 },
                { label: 'Designation', value: emp?.designation, icon: Briefcase },
                { label: 'Branch', value: emp?.branch, icon: MapPin },
                { label: 'Reporting Manager', value: emp?.reportingManager, icon: User },
                { label: 'Joining Date', value: fmtDate(emp?.joinDate), icon: Calendar },
                { label: 'Work Location', value: emp?.workLocation, icon: MapPin },
                { label: 'Employment Status', value: emp?.status, icon: Activity },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-sm transition">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-medium truncate">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="Total Working Days" value={analytics.attendance.totalDays} icon={CalendarCheck} color="indigo" />
                <StatCard label="Present" value={analytics.attendance.present} icon={CheckCircle} color="emerald" />
                <StatCard label="Absent" value={analytics.attendance.absent} icon={XCircle} color="rose" />
                <StatCard label="Half Day" value={analytics.attendance.halfDay} icon={Clock} color="amber" />
                <StatCard label="Late Arrivals" value={analytics.attendance.late} icon={AlertCircle} color="amber" />
                <StatCard label="Early Leaving" value={analytics.attendance.earlyLeave} icon={ArrowLeft} color="slate" />
                <StatCard label="Attendance %" value={`${analytics.attendance.attendancePct}%`} icon={TrendingUp} color="brand" />
                <StatCard label="Avg Working Hours" value={`${analytics.attendance.avgWorkingHours}h`} icon={Clock} color="indigo" />
              </div>
            </div>
          )}

          {/* Leave Tab */}
          {activeTab === 'leave' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total Used" value={analytics.leave.totalUsed} icon={Calendar} color="indigo" />
                <StatCard label="Approved" value={analytics.leave.approved} icon={CheckCircle} color="emerald" />
                <StatCard label="Pending" value={analytics.leave.pending} icon={AlertCircle} color="amber" />
                <StatCard label="Rejected" value={analytics.leave.rejected} icon={XCircle} color="rose" />
              </div>
              {Object.keys(analytics.leave.byType).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Leave by Type</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.leave.byType).map(([type, data]) => (
                      <div key={type} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded transition">
                        <span className="text-sm font-medium text-slate-700">{type}</span>
                        <div className="flex gap-4 text-xs">
                          <span className="text-emerald-600 font-medium">✓ {data.approved}</span>
                          <span className="text-amber-600 font-medium">⏳ {data.pending}</span>
                          <span className="text-rose-600 font-medium">✗ {data.rejected}</span>
                          <span className="text-slate-500 font-semibold">Total: {data.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(analytics.leave.byType).length === 0 && (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">No leave records found for this period.</div>
              )}
            </div>
          )}

          {/* Payroll Tab */}
          {activeTab === 'payroll' && canViewPayroll && (
            <div className="space-y-4">
              {analytics.payroll.current ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <StatCard label="Basic Salary" value={fmt(analytics.payroll.current.basicSalary)} icon={DollarSign} color="indigo" />
                    <StatCard label="Gross Salary" value={fmt(analytics.payroll.current.grossSalary)} icon={TrendingUp} color="emerald" />
                    <StatCard label="Net Salary" value={fmt(analytics.payroll.current.netSalary)} icon={Star} color="brand" />
                    <StatCard label="Total Deductions" value={fmt(analytics.payroll.current.totalDeductions)} icon={AlertCircle} color="rose" />
                    <StatCard label="PF (Employee)" value={fmt(analytics.payroll.current.pfEmployee)} icon={Award} color="amber" />
                    <StatCard label="ESI (Employee)" value={fmt(analytics.payroll.current.esiEmployee)} icon={Award} color="amber" />
                    <StatCard label="TDS" value={fmt(analytics.payroll.current.tds)} icon={FileText} color="slate" />
                    <StatCard label="Overtime Pay" value={fmt(analytics.payroll.current.overtimePay)} icon={Clock} color="indigo" />
                  </div>
                  <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <span className="font-semibold text-brand-800">Year-to-Date Net Salary</span>
                    <span className="text-xl font-black text-brand-600">{fmt(analytics.payroll.ytdNetSalary)}</span>
                  </div>
                  {analytics.payroll.history.length > 1 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                      <h3 className="font-semibold text-slate-800 mb-4">Payroll History (Last 12 Months)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left text-xs font-semibold text-slate-500 pb-2">Month/Year</th>
                              <th className="text-right text-xs font-semibold text-slate-500 pb-2">Gross</th>
                              <th className="text-right text-xs font-semibold text-slate-500 pb-2">Net</th>
                              <th className="text-right text-xs font-semibold text-slate-500 pb-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.payroll.history.map((p: any, i: number) => (
                              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                                <td className="py-2.5 font-medium text-slate-700">{new Date(p.year, p.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</td>
                                <td className="py-2.5 text-right text-slate-600">{fmt(p.grossSalary)}</td>
                                <td className="py-2.5 text-right font-semibold text-slate-800">{fmt(p.netSalary)}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'Processed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">No payroll records found for this employee.</div>
              )}
            </div>
          )}

          {/* Assets Tab */}
          {activeTab === 'assets' && (
            <div className="space-y-3">
              {analytics.assets.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">
                  <Package className="mx-auto mb-2 text-slate-300" size={32} />
                  No assets assigned to this employee.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analytics.assets.map((a, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Package size={18} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{a.name}</p>
                        <p className="text-xs text-slate-400 truncate">{a.assetType} · {a.assetCode}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'Allocated' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {a.status}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">Since {fmtDate(a.allocationDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-3">
              {analytics.documents.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">
                  <FileText className="mx-auto mb-2 text-slate-300" size={32} />
                  No documents found for this employee.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analytics.documents.map((d, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <FileText size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{d.documentType}</p>
                        <p className="text-xs text-slate-400">Uploaded: {fmtDate(d.createdAt)}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium block ${
                          d.verificationStatus === 'Verified' ? 'bg-emerald-100 text-emerald-700' :
                          d.verificationStatus === 'Pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {d.verificationStatus || 'Unverified'}
                        </span>
                        {d.expiryDate && <p className="text-xs text-rose-400">Expires: {fmtDate(d.expiryDate)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
