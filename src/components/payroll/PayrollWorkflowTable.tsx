import React from 'react';
import { Eye, Check, CreditCard, FileText, Download, Send } from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { type PayrollRecord, type Role } from '../../data/mockData';
import { payrollStatusConfig, getStatusBadgeVariant } from '../../utils/PayrollWorkflowEngine';

interface PayrollWorkflowTableProps {
  records: PayrollRecord[];
  primaryColor: string;
  onViewPayslip: (record: PayrollRecord) => void;
  onPrepare: (record: PayrollRecord) => void;
  onVerifyClick: (record: PayrollRecord) => void;
  onPayClick: (record: PayrollRecord) => void;
  onPayslipClick: (record: PayrollRecord) => void;
  onDownload: (record: PayrollRecord) => void;
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <Thead className="sticky top-0 bg-white shadow-sm">
          <tr>
            <Th>Employee</Th>
            <Th>Department</Th>
            <Th>Basic Portion</Th>
            <Th>Allowances</Th>
            <Th>Deductions</Th>
            <Th>Net Salary</Th>
            <Th>Workflow Status</Th>
            <Th className="text-right">Actions</Th>
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
              const config = payrollStatusConfig[currentStatus] || payrollStatusConfig.draft;

              return (
                <Tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                  <Td>
                    <div className="font-semibold text-slate-900 text-sm">{r.employeeName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{r.employeeId}</div>
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
                  <Td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        onClick={() => onViewPayslip(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <Eye size={12} />
                        {isEmployee || !canEdit ? 'View Details' : 'View / Edit'}
                      </button>

                      {!isEmployee && canEdit && currentStatus === 'draft' && (
                        <button
                          onClick={() => onPrepare(r)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-95"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Check size={12} />
                          Prepare
                        </button>
                      )}

                      {!isEmployee && canEdit && currentStatus === 'prepared' && (
                        <button
                          onClick={() => onVerifyClick(r)}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-600"
                        >
                          <Check size={12} />
                          Verify
                        </button>
                      )}

                      {!isEmployee && canEdit && currentStatus !== 'paid' && currentStatus !== 'payslip_generated' && (
                        <button
                          onClick={() => onPayClick(r)}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          <CreditCard size={12} />
                          Mark Paid
                        </button>
                      )}

                      {!isEmployee && canEdit && currentStatus === 'paid' && (
                        <button
                          onClick={() => onPayslipClick(r)}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                        >
                          <FileText size={12} />
                          Generate Payslip
                        </button>
                      )}

                      {(currentStatus === 'paid' || currentStatus === 'payslip_generated') && (
                        <>
                          <button
                            onClick={() => onDownload(r)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-200"
                          >
                            <Download size={12} />
                            Download PDF
                          </button>
                          <button
                            onClick={() => onSendClick(r)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-200"
                          >
                            <Send size={12} />
                            Send Email
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
    </div>
  );
};
