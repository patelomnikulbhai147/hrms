import React from 'react';
import { Eye, Check, CreditCard, FileText, Download, Send } from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { type PayrollRecord, type Role } from '../../data/mockData';
import { payrollStatusConfig, getStatusBadgeVariant } from '../../utils/PayrollWorkflowEngine';

interface PayrollWorkflowTableProps {
  records: PayrollRecord[];
  _role: Role;
  primaryColor: string;
  onViewPayslip: (record: PayrollRecord) => void;
  onPrepare: (record: PayrollRecord) => void;
  onVerifyClick: (record: PayrollRecord) => void;
  onPayClick: (record: PayrollRecord) => void;
  onPayslipClick: (record: PayrollRecord) => void;
  onDownload: (record: PayrollRecord) => void;
  onSendClick: (record: PayrollRecord) => void;
}

export const PayrollWorkflowTable: React.FC<PayrollWorkflowTableProps> = ({
  records,
  _role,
  primaryColor,
  onViewPayslip,
  onPrepare,
  onVerifyClick,
  onPayClick,
  onPayslipClick,
  onDownload,
  onSendClick
}) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <Thead>
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
              <td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-xs">
                No matching payroll logs recorded for this period.
              </td>
            </Tr>
          ) : (
            records.map((r) => {
              const currentStatus = r.payrollStatus || r.status;
              const config = payrollStatusConfig[currentStatus] || payrollStatusConfig.draft;

              return (
                <Tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                  <Td>
                    <div className="font-semibold text-gray-900 text-xs">{r.employeeName}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{r.employeeId}</div>
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-600">{r.department}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-700 font-medium">₹{r.basicSalary.toLocaleString('en-IN')}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-emerald-600 font-semibold">+₹{r.allowances.toLocaleString('en-IN')}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-rose-500 font-semibold">-₹{r.deductions.toLocaleString('en-IN')}</span>
                  </Td>
                  <Td>
                    <span className="text-xs font-bold text-gray-900 bg-slate-100/50 px-2 py-1 rounded">
                      ₹{r.netSalary.toLocaleString('en-IN')}
                    </span>
                  </Td>
                  <Td>
                    <Badge variant={getStatusBadgeVariant(currentStatus)}>
                      {config.label}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* VIEW ACTION (Enabled for all statuses) */}
                      <button
                        onClick={() => onViewPayslip(r)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[10px] font-bold inline-flex items-center gap-1 transition-all"
                        title="View Detailed Ledger"
                      >
                        <Eye size={11} />
                        <span>View</span>
                      </button>

                      {/* DRAFT STATE ACTION */}
                      {currentStatus === 'draft' && (
                        <button
                          onClick={() => onPrepare(r)}
                          className="px-2.5 py-1 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm hover:opacity-90 transition-all"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Check size={11} />
                          <span>Prepare</span>
                        </button>
                      )}

                      {/* PREPARED STATE ACTION */}
                      {currentStatus === 'prepared' && (
                        <button
                          onClick={() => onVerifyClick(r)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm transition-all"
                        >
                          <Check size={11} />
                          <span>Verify</span>
                        </button>
                      )}

                      {/* VERIFIED & FAILED STATE ACTION */}
                      {(currentStatus === 'verified' || currentStatus === 'failed') && (
                        <button
                          onClick={() => onPayClick(r)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm transition-all"
                        >
                          <CreditCard size={11} />
                          <span>Pay</span>
                        </button>
                      )}

                      {/* PAID STATE ACTION (Allow direct digital signing or download/send) */}
                      {currentStatus === 'paid' && (
                        <>
                          <button
                            onClick={() => onPayslipClick(r)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm transition-all"
                          >
                            <FileText size={11} />
                            <span>Payslip</span>
                          </button>
                          <button
                            onClick={() => onDownload(r)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold inline-flex items-center gap-1 transition-all"
                          >
                            <Download size={11} />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => onSendClick(r)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold inline-flex items-center gap-1 transition-all"
                          >
                            <Send size={11} />
                            <span>Send</span>
                          </button>
                        </>
                      )}

                      {/* PAYSLIP GENERATED STATE ACTION */}
                      {currentStatus === 'payslip_generated' && (
                        <>
                          <button
                            onClick={() => onDownload(r)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Download size={11} />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => onSendClick(r)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Send size={11} />
                            <span>Send</span>
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
