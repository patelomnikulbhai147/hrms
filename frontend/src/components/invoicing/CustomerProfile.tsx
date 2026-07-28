import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td } from '@/components/ui/Table';
import { Paginated } from '@/components/ui/Paginated';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { Input } from '@/components/ui/Input';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { 
  Building2, MapPin, Mail, Phone, FileText, ArrowLeft, MoreHorizontal, Download, 
  Printer, TrendingUp, CreditCard, Clock, CheckCircle2, AlertTriangle, Receipt, 
  Send, Maximize2, History, MessageSquare, Briefcase, Activity, Search, Bell
} from 'lucide-react';
import { ui } from '@/components/ui/feedback';
import { PaymentReminderCenterModal } from '@/components/invoicing/PaymentReminderCenterModal';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Minimal inr helper
const inr = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  customerId: string | number;
  onBack: () => void;
  onEdit: (id: string | number) => void;
  onGenerateInvoice: (customerId: string | number) => void;
  onSelectInvoice?: (invoiceId: string | number) => void;
}

export const CustomerProfile: React.FC<Props> = ({ customerId, onBack, onEdit, onGenerateInvoice, onSelectInvoice }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTabState] = useState<'overview' | 'invoices' | 'payments' | 'products' | 'timeline' | 'info'>('overview');
  const [remindId, setRemindId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as any;
    if (tab && ['overview', 'invoices', 'payments', 'products', 'timeline', 'info'].includes(tab)) {
      setActiveTabState(tab);
    }
    const onPopState = () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('tab') as any;
      setActiveTabState((t && ['overview', 'invoices', 'payments', 'products', 'timeline', 'info'].includes(t)) ? t : 'overview');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setActiveTab = (tab: typeof activeTab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  const [invoiceSearch, setInvoiceSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await (api as any).invoicing.getCustomerProfile(customerId);
        if (!cancelled) setData(res);
      } catch (err: any) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [customerId]);

  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    if (!invoiceSearch) return data.invoices;
    const q = invoiceSearch.toLowerCase();
    return data.invoices.filter((i: any) => 
      (i.invoiceNumber || '').toLowerCase().includes(q) ||
      (i.status || '').toLowerCase().includes(q)
    );
  }, [data?.invoices, invoiceSearch]);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="flex gap-4 items-center">
          <div className="w-16 h-16 bg-slate-200 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-1/3 bg-slate-200 rounded" />
            <div className="h-4 w-1/4 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-200 rounded" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-rose-600 bg-rose-50 rounded-lg">
        <AlertTriangle className="mx-auto mb-2" size={32} />
        <p className="font-medium">{error}</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  if (!data) return null;

  const { customer, invoices, payments, audits, metrics, products, charts } = data;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'info', label: 'Information', icon: Building2 },
    { id: 'invoices', label: 'Invoices', icon: Receipt, count: invoices.length },
    { id: 'payments', label: 'Payments', icon: CreditCard, count: payments.length },
    { id: 'products', label: 'Products & Services', icon: Briefcase, count: products.length },
    { id: 'timeline', label: 'Timeline', icon: History, count: audits.length },
  ] as const;

  return (
    <div className="bg-slate-50 min-h-full pb-12">
      {/* HEADER SECTION */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2 text-slate-500">
            <ArrowLeft size={16} className="mr-2" /> Back to Customers
          </Button>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[#FDF8F5] border border-[#F6E3D8] text-[#C77E52] rounded-full flex items-center justify-center font-bold text-2xl shadow-sm">
                {customer.companyName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-800">{customer.companyName}</h1>
                  <Badge variant={customer.isActive ? 'green' : 'gray'}>
                    {customer.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="blue" className="font-mono">{customer.customerCode}</Badge>
                </div>
                <div className="text-sm text-slate-500 mt-1 flex items-center gap-4 flex-wrap">
                  {customer.contactPerson && <span className="flex items-center gap-1"><Building2 size={14} /> {customer.contactPerson}</span>}
                  {customer.email && <span className="flex items-center gap-1"><Mail size={14} /> {customer.email}</span>}
                  {customer.phone && <span className="flex items-center gap-1"><Phone size={14} /> {customer.phone}</span>}
                  {customer.gstin && <span className="flex items-center gap-1"><FileText size={14} /> GST: {customer.gstin}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onEdit(customer.id)}>
                Edit Customer
              </Button>
              <Button variant="outline" icon={<Bell size={14} />} onClick={() => {
                if (!invoices || invoices.length === 0) {
                  ui.toast.error('No invoices exist for this customer yet.');
                  return;
                }
                const overdue = invoices.find((i: any) => i.status === 'Overdue' || (i.balanceDue > 0 && new Date(i.dueDate) < new Date()));
                const pending = invoices.find((i: any) => i.balanceDue > 0 && i.status !== 'Draft' && i.status !== 'Cancelled');
                const target = overdue || pending || invoices[0];
                setRemindId(target.id);
              }}>
                Send Reminder
              </Button>
              <Button variant="primary" className="bg-[#C77E52] hover:bg-[#b06f47] text-white" onClick={() => onGenerateInvoice(customer.id)}>
                Generate Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="flex gap-6 border-b border-slate-200 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === t.id 
                  ? 'border-[#C77E52] text-[#C77E52]' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <t.icon size={16} />
              {t.label}
              {(t as any).count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === t.id ? 'bg-[#FDF8F5] text-[#C77E52]' : 'bg-slate-100 text-slate-500'}`}>
                  {(t as any).count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="p-4 shadow-sm border-l-4 border-l-blue-500">
                <p className="text-sm font-medium text-slate-500">Total Invoiced</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{inr(metrics.totalInvoiceAmount)}</p>
                <p className="text-xs text-slate-400 mt-1">{metrics.totalInvoices} Invoices</p>
              </Card>
              <Card className="p-4 shadow-sm border-l-4 border-l-green-500">
                <p className="text-sm font-medium text-slate-500">Total Paid</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{inr(metrics.totalAmountPaid)}</p>
                <p className="text-xs text-slate-400 mt-1">{metrics.paidInvoices} Fully Paid</p>
              </Card>
              <Card className="p-4 shadow-sm border-l-4 border-l-rose-500">
                <p className="text-sm font-medium text-slate-500">Outstanding</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{inr(metrics.outstandingAmount)}</p>
                <p className="text-xs text-rose-500 mt-1 font-medium">{metrics.overdueInvoices} Overdue</p>
              </Card>
              <Card className="p-4 shadow-sm border-l-4 border-l-slate-300">
                <p className="text-sm font-medium text-slate-500">Avg Invoice</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{inr(metrics.averageInvoiceValue)}</p>
              </Card>
              <Card className="p-4 shadow-sm border-l-4 border-l-amber-500">
                <p className="text-sm font-medium text-slate-500">Drafts</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{metrics.draftInvoices}</p>
                <p className="text-xs text-slate-400 mt-1">Pending Generation</p>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                <TrendingUp size={18} className="text-[#C77E52]" /> Revenue vs Collections (12 Months)
              </h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `₹${val/1000}k`} />
                    <Tooltip cursor={{ stroke: '#cbd5e1' }} formatter={(val: any) => inr(val || 0)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                    <Line type="monotone" name="Invoiced Amount" dataKey="invoiceAmount" stroke="#C77E52" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="Collections (Paid)" dataKey="payments" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <Input 
                icon={<Search size={16} />} 
                placeholder="Search invoices..." 
                value={invoiceSearch}
                onChange={e => setInvoiceSearch(e.target.value)}
                className="w-72 bg-white"
              />
            </div>
            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Receipt size={48} className="mx-auto mb-4 text-slate-300" />
                <p>No invoices found.</p>
              </div>
            ) : (
              <Paginated items={filteredInvoices} pageSize={10} resetKey={invoiceSearch} label="invoices">
                {(pageItems, { startIndex }) => (
                  <div className="overflow-x-auto w-full">
                    <Table>
                      <Thead>
                        <tr>
                          <Th className="w-16 text-center text-slate-400">No.</Th>
                          <Th>Invoice #</Th>
                          <Th>Date</Th>
                          <Th>Due Date</Th>
                          <Th className="text-right">Amount</Th>
                          <Th className="text-right">Paid</Th>
                          <Th className="text-right">Outstanding</Th>
                          <Th className="text-center">Status</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {pageItems.map((inv: any, i: number) => (
                          <tr
                            key={inv.id || i}
                            onClick={() => { if (onSelectInvoice && inv.id) onSelectInvoice(inv.id); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                                e.preventDefault();
                                if (onSelectInvoice && inv.id) onSelectInvoice(inv.id);
                              }
                            }}
                            tabIndex={0}
                            aria-label={`View invoice ${inv.invoiceNumber || ''}`}
                            className="cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:shadow-sm hover:border-l-4 hover:border-l-[#C77E52] border-l-4 border-l-transparent focus:outline-none focus:bg-slate-50 focus:shadow-sm focus:border-l-[#C77E52]"
                          >
                            <Td className="text-center text-slate-400">{startIndex + i + 1}</Td>
                            <Td><span className="font-semibold text-slate-700">{inv.invoiceNumber}</span></Td>
                            <Td>{formatDate(inv.invoiceDate)}</Td>
                            <Td><span className={inv.dueDate && new Date(inv.dueDate) < new Date() && !['Paid','Closed'].includes(inv.status) ? 'text-rose-600 font-medium' : ''}>{inv.dueDate ? formatDate(inv.dueDate) : '-'}</span></Td>
                            <Td className="text-right font-medium">{inr(inv.grandTotal)}</Td>
                            <Td className="text-right text-green-600">{inr(inv.amountPaid)}</Td>
                            <Td className="text-right text-rose-600 font-medium">{inr(inv.balanceDue)}</Td>
                            <Td className="text-center"><Badge variant={inv.status === 'Paid' ? 'green' : inv.status === 'Draft' ? 'gray' : 'blue'}>{inv.status}</Badge></Td>
                          </tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}
              </Paginated>
            )}
          </Card>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <Card className="p-0 overflow-hidden">
            {payments.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <CreditCard size={48} className="mx-auto mb-4 text-slate-300" />
                <p>No payments recorded yet.</p>
              </div>
            ) : (
              <Paginated items={payments} pageSize={10} label="payments">
                {(pageItems, { startIndex }) => (
                  <div className="overflow-x-auto w-full">
                    <Table>
                      <Thead>
                        <tr>
                          <Th className="w-16 text-center text-slate-400">No.</Th>
                          <Th>Date</Th>
                          <Th className="text-right">Amount</Th>
                          <Th>Mode</Th>
                          <Th>Reference</Th>
                          <Th className="text-center">Status</Th>
                          <Th>Remarks</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {pageItems.map((p: any, i: number) => (
                          <tr key={p.id || i} className="hover:bg-slate-50/60 transition-colors">
                            <Td className="text-center text-slate-400">{startIndex + i + 1}</Td>
                            <Td>{formatDateTime(p.paymentDate)}</Td>
                            <Td className="text-right"><span className="font-semibold text-green-600">{inr(p.amount)}</span></Td>
                            <Td>{p.paymentMode || '-'}</Td>
                            <Td>{p.referenceNo || '-'}</Td>
                            <Td className="text-center"><Badge variant={p.status === 'Paid' ? 'green' : 'gray'}>{p.status}</Badge></Td>
                            <Td>{p.notes || '-'}</Td>
                          </tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}
              </Paginated>
            )}
          </Card>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === 'products' && (
          <Card className="p-0 overflow-hidden">
            {products.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Briefcase size={48} className="mx-auto mb-4 text-slate-300" />
                <p>No products or services purchased yet.</p>
              </div>
            ) : (
              <Paginated items={products} pageSize={10} label="products">
                {(pageItems, { startIndex }) => (
                  <div className="overflow-x-auto w-full">
                    <Table>
                      <Thead>
                        <tr>
                          <Th className="w-16 text-center text-slate-400">No.</Th>
                          <Th>Product/Service</Th>
                          <Th>HSN/SAC</Th>
                          <Th className="text-right">Total Qty</Th>
                          <Th className="text-right">Last Price</Th>
                          <Th className="text-right">Total Revenue</Th>
                          <Th>Last Purchased</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {pageItems.map((p: any, i: number) => (
                          <tr key={p.id || i} className="hover:bg-slate-50/60 transition-colors">
                            <Td className="text-center text-slate-400">{startIndex + i + 1}</Td>
                            <Td><span className="font-medium text-slate-700">{p.product}</span></Td>
                            <Td>{p.category}</Td>
                            <Td className="text-right">{p.totalPurchased}</Td>
                            <Td className="text-right">{inr(p.unitPrice)}</Td>
                            <Td className="text-right"><span className="font-semibold text-blue-600">{inr(p.revenue)}</span></Td>
                            <Td>{formatDate(p.lastPurchased)}</Td>
                          </tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}
              </Paginated>
            )}
          </Card>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <Card className="p-6">
            <h3 className="font-bold text-slate-800 mb-6">Activity Timeline</h3>
            {audits.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <History size={48} className="mx-auto mb-4 text-slate-300" />
                <p>No activity recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                {audits.map((audit: any) => (
                  <div key={audit.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      <History size={16} />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded bg-white shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-bold text-slate-800">{audit.action}</div>
                        <time className="text-xs font-medium text-slate-400">{formatDateTime(audit.createdAt)}</time>
                      </div>
                      <div className="text-sm text-slate-500 leading-snug">
                        {audit.details || `${audit.entityType} Activity`}
                      </div>
                      <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                        User ID: {audit.performedBy || 'System'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Business Identity</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Company Name:</span>
                  <span className="col-span-2 text-slate-800 font-semibold">{customer.companyName}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">GST Number:</span>
                  <span className="col-span-2 text-slate-800">{customer.gstin || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">PAN Number:</span>
                  <span className="col-span-2 text-slate-800">{customer.pan || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Customer Since:</span>
                  <span className="col-span-2 text-slate-800">{formatDate(customer.createdAt)}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Contact & Address</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Contact Person:</span>
                  <span className="col-span-2 text-slate-800">{customer.contactPerson || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Email:</span>
                  <span className="col-span-2 text-slate-800">{customer.email || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Phone:</span>
                  <span className="col-span-2 text-slate-800">{customer.phone || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-slate-500 font-medium">Billing Address:</span>
                  <span className="col-span-2 text-slate-800">{customer.addressLine} {customer.city ? `, ${customer.city}` : ''} {customer.state ? `, ${customer.state}` : ''}</span>
                </div>
              </div>
            </Card>

            {customer.notes && (
              <Card className="p-6 md:col-span-2 bg-[#fffdfa] border-[#faeadb]">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-[#C77E52]"/> Internal Notes</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{customer.notes}</p>
              </Card>
            )}
          </div>
        )}

      </div>

      {remindId !== null && (
        <PaymentReminderCenterModal
          invoiceId={remindId}
          onClose={() => setRemindId(null)}
          onChanged={() => {
            (api as any).invoicing.getCustomerProfile(customerId).then(setData).catch(() => {});
          }}
          onViewInvoice={() => {
            const id = remindId;
            setRemindId(null);
            if (onSelectInvoice) onSelectInvoice(id);
          }}
        />
      )}
    </div>
  );
};
