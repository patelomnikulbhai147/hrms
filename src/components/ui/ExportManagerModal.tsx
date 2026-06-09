import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Badge } from './Badge';
import { Download, FileSpreadsheet, FileText, Filter, Users, DollarSign, Calendar, CheckSquare, Settings2, DownloadCloud } from 'lucide-react';
import { exportToExcel } from '../../utils/exportUtils';
import { Employee, PayrollRecord, AttendanceRecord, LeaveRequest, Company } from '../../data/mockData';

interface ExportManagerModalProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  payroll: PayrollRecord[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  companies: Company[];
  activeCompanyId: string;
}

type DataSource = 'employees' | 'payroll' | 'attendance' | 'leaves';

const SOURCE_FIELDS: Record<DataSource, { key: string, label: string }[]> = {
  employees: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Full Name' },
    { key: 'email', label: 'Email Address' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'branchLocation', label: 'Branch Location' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'joinDate', label: 'Join Date' },
    { key: 'exitDate', label: 'Exit Date' },
    { key: 'salary', label: 'Annual Salary' },
    { key: 'aadhaar', label: 'Aadhaar' },
    { key: 'pan', label: 'PAN Card' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'accountNumber', label: 'Account Number' }
  ],
  payroll: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'month', label: 'Month' },
    { key: 'basicSalary', label: 'Basic Salary' },
    { key: 'allowances', label: 'Allowances' },
    { key: 'deductions', label: 'Deductions' },
    { key: 'netSalary', label: 'Net Salary' },
    { key: 'status', label: 'Payment Status' }
  ],
  attendance: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Attendance Status' },
    { key: 'clockIn', label: 'Clock In' },
    { key: 'clockOut', label: 'Clock Out' }
  ],
  leaves: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'fromDate', label: 'From Date' },
    { key: 'toDate', label: 'To Date' },
    { key: 'days', label: 'Total Days' },
    { key: 'status', label: 'Approval Status' }
  ]
};

export const ExportManagerModal: React.FC<ExportManagerModalProps> = ({
  open, onClose, employees, payroll, attendance, leaves, companies, activeCompanyId
}) => {
  const [selectedSources, setSelectedSources] = useState<DataSource[]>(['employees']);
  const [selectedFields, setSelectedFields] = useState<Record<DataSource, string[]>>({
    employees: ['employeeId', 'name', 'branchLocation', 'department', 'status'],
    payroll: ['employeeId', 'month', 'netSalary', 'status'],
    attendance: ['employeeId', 'date', 'status'],
    leaves: ['employeeId', 'leaveType', 'days', 'status']
  });

  const [format, setFormat] = useState<'excel' | 'csv'>('excel');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isExporting, setIsExporting] = useState(false);

  const toggleSource = (source: DataSource) => {
    setSelectedSources(prev => 
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    );
  };

  const toggleField = (source: DataSource, fieldKey: string) => {
    setSelectedFields(prev => {
      const sourceFields = prev[source] || [];
      return {
        ...prev,
        [source]: sourceFields.includes(fieldKey) 
          ? sourceFields.filter(k => k !== fieldKey)
          : [...sourceFields, fieldKey]
      };
    });
  };

  // Preview counts based on filters
  const previewMetrics = useMemo(() => {
    let empCount = employees.length;
    let payCount = payroll.length;
    let attCount = attendance.length;
    let levCount = leaves.length;

    if (branchFilter !== 'All') {
      const filteredEmps = employees.filter(e => e.branchLocation === branchFilter || (!e.branchLocation && branchFilter === 'Ahmedabad'));
      const validEmpIds = new Set(filteredEmps.map(e => e.id));
      empCount = filteredEmps.length;
      payCount = payroll.filter(p => validEmpIds.has(p.employeeId)).length;
      attCount = attendance.filter(a => validEmpIds.has(a.employeeId)).length;
      levCount = leaves.filter(l => validEmpIds.has(l.employeeId)).length;
    }

    if (statusFilter !== 'All') {
      empCount = employees.filter(e => e.status === statusFilter).length;
    }

    return { employees: empCount, payroll: payCount, attendance: attCount, leaves: levCount };
  }, [employees, payroll, attendance, leaves, branchFilter, statusFilter]);

  const handleExport = async () => {
    if (selectedSources.length === 0) return;
    setIsExporting(true);

    try {
      // Simulate large processing delay for UI feedback
      await new Promise(res => setTimeout(res, 800));

      const activeCompany = companies.find(c => c.id === activeCompanyId);
      const companyNamePrefix = activeCompany ? activeCompany.name.replace(/[^a-zA-Z0-9]/g, '') : 'Company';

      const exportSheets = selectedSources.map(source => {
        let rawData: any[] = [];
        if (source === 'employees') rawData = employees;
        if (source === 'payroll') rawData = payroll;
        if (source === 'attendance') rawData = attendance;
        if (source === 'leaves') rawData = leaves;

        // Apply filters
        if (branchFilter !== 'All' && source === 'employees') {
          rawData = rawData.filter(e => e.branchLocation === branchFilter || (!e.branchLocation && branchFilter === 'Ahmedabad'));
        }
        if (statusFilter !== 'All' && source === 'employees') {
          rawData = rawData.filter(e => e.status === statusFilter);
        }

        const cols = (selectedFields[source] || []).map(key => {
          const def = SOURCE_FIELDS[source].find(f => f.key === key);
          return { header: def?.label || key, key, width: 20 };
        });

        // Resolve names for non-employee tables
        const finalData = rawData.map(record => {
           if (source !== 'employees' && record.employeeId) {
              const emp = employees.find(e => e.id === record.employeeId);
              return { ...record, name: emp?.name || 'Unknown' };
           }
           return record;
        });

        // If they requested ID but also we mapped name, maybe insert name dynamically
        if (source !== 'employees' && !cols.find(c => c.key === 'name') && cols.length > 0) {
           cols.splice(1, 0, { header: 'Employee Name', key: 'name', width: 25 });
        }

        return {
          sheetName: source.charAt(0).toUpperCase() + source.slice(1),
          columns: cols,
          data: finalData
        };
      });

      // Track Export History in LocalStorage
      const historyRaw = localStorage.getItem('hrms_export_history') || '[]';
      const history = JSON.parse(historyRaw);
      history.push({
        date: new Date().toISOString(),
        sources: selectedSources,
        format,
        records: exportSheets.reduce((acc, curr) => acc + curr.data.length, 0)
      });
      localStorage.setItem('hrms_export_history', JSON.stringify(history));

      exportToExcel({
        fileName: `${companyNamePrefix}_Enterprise_Export`,
        format,
        sheets: exportSheets
      });

      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enterprise Data Export Configuration" size="lg" footer={
      <div className="flex justify-between w-full items-center">
        <span className="text-xs text-slate-500 font-medium">Format: {format.toUpperCase()} · Multi-sheet supported</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>Cancel</Button>
          <Button icon={<DownloadCloud size={14} />} onClick={handleExport} disabled={selectedSources.length === 0 || isExporting} loading={isExporting}>
            {isExporting ? 'Generating Package...' : 'Generate & Download'}
          </Button>
        </div>
      </div>
    }>
      <div className="space-y-6 text-left text-xs font-sans">
        
        {/* Data Source Selection */}
        <div>
          <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] mb-3 flex items-center gap-1.5">
            <CheckSquare size={12} className="text-blue-500" /> 1. Select Data Sources
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'employees', label: 'Employees', icon: Users, count: previewMetrics.employees },
              { id: 'payroll', label: 'Payroll', icon: DollarSign, count: previewMetrics.payroll },
              { id: 'attendance', label: 'Attendance', icon: Calendar, count: previewMetrics.attendance },
              { id: 'leaves', label: 'Leaves', icon: FileText, count: previewMetrics.leaves }
            ].map(source => {
              const isSelected = selectedSources.includes(source.id as DataSource);
              const Icon = source.icon;
              return (
                <div 
                  key={source.id}
                  onClick={() => toggleSource(source.id as DataSource)}
                  className={`border rounded-xl p-3 cursor-pointer transition-all duration-200 ${
                    isSelected ? 'border-blue-500 bg-blue-50/50 shadow-sm shadow-blue-100 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <Icon size={16} className={isSelected ? 'text-blue-600' : 'text-slate-400'} />
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                      {isSelected && <CheckSquare size={10} className="text-white absolute opacity-0" />}
                    </div>
                  </div>
                  <p className={`font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{source.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{source.count} records</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Filters */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-3">
          <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
            <Filter size={12} className="text-slate-400" /> 2. Global Export Filters
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Branch Location</label>
              <select 
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all shadow-sm"
              >
                <option value="All">All Branches</option>
                <option value="AHMEDABAD">Ahmedabad</option>
                <option value="RAJKOT">Rajkot</option>
                <option value="BHAVNAGAR">Bhavnagar</option>
                <option value="SIDDHPUR">Siddhpur</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Employee Status</label>
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all shadow-sm"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Terminated">Terminated / Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Field Selection per Source */}
        {selectedSources.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Settings2 size={12} className="text-slate-400" /> 3. Select Fields to Include
            </h4>
            
            {selectedSources.map(source => (
              <div key={source} className="border border-slate-150 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-150 font-bold text-[11px] text-slate-700 flex justify-between items-center">
                  <span className="capitalize">{source} Dataset Fields</span>
                  <Badge variant="blue" className="text-[9px] px-1.5 py-0">{selectedFields[source]?.length || 0} selected</Badge>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white max-h-48 overflow-y-auto">
                  {SOURCE_FIELDS[source].map(field => {
                    const isChecked = (selectedFields[source] || []).includes(field.key);
                    return (
                      <label key={field.key} className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1 rounded transition-colors">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleField(source, field.key)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-[10px] ${isChecked ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                          {field.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Export Format */}
        <div className="pt-2">
          <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] mb-3 flex items-center gap-1.5">
            <Download size={12} className="text-slate-400" /> 4. Export Format
          </h4>
          <div className="flex gap-3">
            <button
              onClick={() => setFormat('excel')}
              className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border font-bold transition-all ${format === 'excel' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <FileSpreadsheet size={16} /> Enterprise Excel (.xlsx)
            </button>
            <button
              onClick={() => setFormat('csv')}
              className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border font-bold transition-all ${format === 'csv' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <FileText size={16} /> CSV (Comma Separated)
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
};
