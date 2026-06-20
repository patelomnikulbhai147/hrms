import React from 'react';
import { Eye, Check, FileText, Download, Send, CheckCircle } from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { type PayrollRecord, type Role } from '@/data/mockData';
import { payrollStatusConfig, getStatusBadgeVariant } from '@/utils/PayrollWorkflowEngine';

interface PayrollWorkflowTableProps {
  records: PayrollRecord[];
  primaryColor: string;
  onViewPayslip: (record: PayrollRecord) => void;
  onPrepare: (record: PayrollRecord) => void;
  onVerifyClick: (record: PayrollRecord) => void;
  onPayClick: (record: PayrollRecord) => void;
  onPayslipClick: (record: PayrollRecord) => void;
  onDownload: (record: PayrollRecord, format: 'pdf' | 'xlsx') => void;
  onSendClick: (record: PayrollRecord) => void;
  role: Role;
  canEdit?: boolean;
}

export const PayrollWorkflowTable: React.FC<PayrollWorkflowTableProps> = ({
  records,
  primaryColor,
  onViewPayslip,
  onPrepare,
  onVerifyClick,
  onPayClick,
  onPayslipClick,
  onDownload,
  onSendClick,
  role,
  canEdit = true
}) => {
  const isEmployee = role === 'Employee';

  return (
    <Table className="bg-white border-slate-200 shadow-sm rounded-2xl">
      <Thead className="sticky top-0 bg-white shadow-sm z-20">
        <tr>
          <Th>Employee</Th>
          <Th>Department</Th>
          <Th>Basic Portion</Th>
          <Th>Allowances</Th>
          <Th>Deductions</Th>
          <Th>Net Salary</Th>
          <Th>Workflow Status</Th>
          <Th className="text-right sticky right-0 bg-white z-30 drop-shadow-[-4px_0_6px_rgba(0,0,0,0.05)] border-l border-slate-100 min-w-[200px]">Actions</Th>
        </tr>
      </Thead>
      <Tbody>
        {records.length === 0 ? (
          <Tr>
            <td colSpan={8} className="px-3 py-10 text-center text-gray-400 text-sm">
              No payroll records found for this company. Prepare payroll to begin reconciliation.
            </td>
          </Tr>
        ) : (
          records.map((r) => {
            const currentStatus = r.payrollStatus || r.status;
            const config = (payrollStatusConfig as any)[currentStatus] || payrollStatusConfig.draft;

            return (
              <Tr key={r.id} className="group border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <Td>
                  <div className="font-semibold text-slate-900 text-sm">{r.employeeName}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{(r as any).employee?.employeeId || ''}</div>
                </Td>
                <Td>
                  <span className="text-sm text-slate-600">{r.department}</span>
                </Td>
                <Td>
                  <span className="text-sm text-slate-900 font-semibold">₹{r.basicSalary.toLocaleString('en-IN')}</span>
                </Td>
                <Td>
                  <span className="text-sm text-emerald-600 font-semibold">+₹{r.allowances.toLocaleString('en-IN')}</span>
                </Td>
                <Td>
                  <span className="text-sm text-rose-600 font-semibold">-₹{r.deductions.toLocaleString('en-IN')}</span>
                </Td>
                <Td>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-900">
                    ₹{r.netSalary.toLocaleString('en-IN')}
                  </span>
                </Td>
                <Td>
                  <Badge variant={getStatusBadgeVariant(currentStatus)}>{config.label}</Badge>
                </Td>
                <Td className="text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors z-20 drop-shadow-[-4px_0_6px_rgba(0,0,0,0.05)] border-l border-slate-100">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => onViewPayslip(r)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Eye size={12} />
                      {isEmployee || !canEdit ? 'View' : 'View / Edit'}
                    </button>

                    {canEdit && currentStatus === 'draft' && (
                      <button
                        onClick={() => onPrepare(r)}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-95"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Check size={12} />
                        Prepare
                      </button>
                    )}

                    {canEdit && currentStatus === 'prepared' && (
                      <button
                        onClick={() => onVerifyClick(r)}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-600"
                      >
                        <Check size={12} />
                        Verify
                      </button>
                    )}

                    {canEdit && ((currentStatus as string) === 'paid' || (currentStatus as string) === 'payslip_generated' || (currentStatus as string) === 'completed') ? (
                      <button
                        disabled
                        className="inline-flex items-center gap-1 rounded-[12px] bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-semibold text-[#15803D] cursor-not-allowed"
                      >
                        <Check size={12} />
                        Paid
                      </button>
                    ) : canEdit ? (
                      <button
                        onClick={() => onPayClick(r)}
                        className="inline-flex items-center gap-1 rounded-[12px] bg-[#10B981] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#059669]"
                      >
                        <CheckCircle size={12} />
                        Mark Paid
                      </button>
                    ) : null}

                    {canEdit && currentStatus === 'paid' && (
                      <button
                        onClick={() => onPayslipClick(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 whitespace-nowrap"
                      >
                        <FileText size={12} />
                        Payslip
                      </button>
                    )}

                    {(currentStatus === 'paid' || currentStatus === 'payslip_generated') && (
                      <>
                        <button
                          onClick={() => onDownload(r, 'pdf')}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 border border-red-100 whitespace-nowrap"
                        >
                          <Download size={12} />
                          PDF
                        </button>
                        <button
                          onClick={() => onDownload(r, 'xlsx')}
                          className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1.5 text-[11px] font-semibold text-green-700 transition hover:bg-green-100 border border-green-100 whitespace-nowrap"
                        >
                          <Download size={12} />
                          XLSX
                        </button>
                        <button
                          onClick={() => onSendClick(r)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-200 whitespace-nowrap"
                        >
                          <Send size={12} />
                          Email
                        </button>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            );
          })
        )}
      </Tbody>
    </Table>
  );
};
