import React, { useState, useEffect } from 'react';
import {
  Bell, Send, Mail, MessageSquare, Smartphone, Check, AlertTriangle,
  Calendar, Phone, Copy, Printer, FileDown, Eye, CheckCircle2, XCircle,
  Clock, ShieldCheck, Download, ExternalLink, IndianRupee, History,
  RefreshCw, AlertCircle, FileText, CheckSquare, Square, Sparkles,
  HeartHandshake, PartyPopper, ChevronRight, ArrowRight, Ban, Info,
  Building2, User, CreditCard, Share2
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';

interface PaymentReminderCenterModalProps {
  invoiceId: number;
  onClose: () => void;
  onChanged: () => void;
  onViewInvoice?: () => void;
}

const inr = (n?: number | null) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (d?: string | Date | null) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const PaymentReminderCenterModal: React.FC<PaymentReminderCenterModalProps> = ({
  invoiceId, onClose, onChanged, onViewInvoice
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'email-preview' | 'whatsapp-preview' | 'timeline' | 'reminder-history'>('editor');
  const [timelineMode, setTimelineMode] = useState<'all' | 'payments'>('all');

  // Channel selections
  const [channels, setChannels] = useState<string[]>(['Email', 'WhatsApp']);
  // Attachment selections
  const [attachments, setAttachments] = useState<string[]>([
    'Attach Invoice PDF',
    'Attach Payment Link'
  ]);

  // Message Editor State
  const [templateType, setTemplateType] = useState<'standard' | 'urgent' | 'short'>('standard');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reschedule due date state
  const [rescheduling, setRescheduling] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  // Thank you email state
  const [sendingThankYou, setSendingThankYou] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.invoicing.getReminderCenter(invoiceId);
      setData(res);
      const inv = res.invoice || {};
      setNewDueDate(inv.dueDate || new Date().toISOString().slice(0, 10));

      // Set default template
      const compName = res.companyName || 'Our Company';
      const custName = inv.billToName || 'Valued Customer';
      const invNo = inv.invoiceNumber || '';
      const totalStr = inr(inv.grandTotal);
      const paidStr = inr(inv.amountPaid);
      const remStr = inr(inv.balanceDue);
      const dueStr = formatDate(inv.dueDate);

      if (templateType === 'standard') {
        setSubject(`Payment Reminder - Invoice ${invNo}`);
        setMessage(`Dear ${custName},\n\nHope you are doing well.\n\nThis is a friendly reminder regarding Invoice ${invNo}.\n\nInvoice Amount: ${totalStr}\nPaid Amount: ${paidStr}\nOutstanding Balance: ${remStr}\nDue Date: ${dueStr}\n\nKindly complete the payment before the due date.\nIf payment has already been made, please ignore this message.\n\nThank you.\n\nRegards,\n${compName}`);
      }
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not load reminder details.'));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [invoiceId]);

  const applyTemplatePreset = (type: 'standard' | 'urgent' | 'short') => {
    setTemplateType(type);
    if (!data) return;
    const inv = data.invoice || {};
    const compName = data.companyName || 'Our Company';
    const custName = inv.billToName || 'Valued Customer';
    const invNo = inv.invoiceNumber || '';
    const totalStr = inr(inv.grandTotal);
    const paidStr = inr(inv.amountPaid);
    const remStr = inr(inv.balanceDue);
    const dueStr = formatDate(inv.dueDate);

    if (type === 'standard') {
      setSubject(`Payment Reminder - Invoice ${invNo}`);
      setMessage(`Dear ${custName},\n\nHope you are doing well.\n\nThis is a friendly reminder regarding Invoice ${invNo}.\n\nInvoice Amount: ${totalStr}\nPaid Amount: ${paidStr}\nOutstanding Balance: ${remStr}\nDue Date: ${dueStr}\n\nKindly complete the payment before the due date.\nIf payment has already been made, please ignore this message.\n\nThank you.\n\nRegards,\n${compName}`);
    } else if (type === 'urgent') {
      setSubject(`URGENT: Overdue Payment Notice - Invoice ${invNo}`);
      setMessage(`Dear ${custName},\n\nURGENT NOTICE:\nYour payment for Invoice ${invNo} is now OVERDUE by ${data.overdueDays || 0} days.\n\nOutstanding Amount: ${remStr}\nOriginal Due Date: ${dueStr}\n\nPlease settle this overdue invoice immediately to avoid disruption of services.\n\nIf you have already processed the payment, please share the transaction reference number with us.\n\nRegards,\n${compName}`);
      if (!channels.includes('Email')) setChannels(c => [...c, 'Email']);
      if (!channels.includes('WhatsApp')) setChannels(c => [...c, 'WhatsApp']);
    } else if (type === 'short') {
      setSubject(`Invoice ${invNo} Payment Link`);
      setMessage(`Hi ${custName}, friendly reminder to settle Invoice ${invNo} (${remStr}) due on ${dueStr}. Payment link: https://pay.zenia.app/inv/${invNo}\n\nRegards, ${compName}`);
    }
  };

  const toggleChannel = (ch: string) => {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  };

  const toggleAttachment = (att: string) => {
    setAttachments(prev => prev.includes(att) ? prev.filter(a => a !== att) : [...prev, att]);
  };

  const handleSendReminder = async (forceResend = false) => {
    if (channels.length === 0) {
      ui.toast.error('Please select at least one communication channel (e.g., Email or WhatsApp).');
      return;
    }
    if (!message.trim()) {
      ui.toast.error('Reminder message cannot be empty.');
      return;
    }

    setSending(true);
    try {
      const payload = {
        channels,
        subject,
        message,
        attachments,
        toEmail: data.invoice.billToEmail,
        toPhone: data.invoice.billToPhone,
        force: forceResend
      };
      const res = await api.invoicing.sendReminder(invoiceId, payload);
      ui.toast.success(`Payment reminder successfully sent via ${channels.join(', ')}!`);
      onChanged();
      loadData();
      setActiveTab('reminder-history');
    } catch (e: any) {
      if (e?.status === 429 || e?.requiresConfirmation || e?.message?.includes('recently')) {
        const confirmResend = await ui.confirm({
          title: 'Send another reminder?',
          message: 'A reminder for this invoice went out less than 10 minutes ago. Sending again now means the customer receives two.',
          confirmText: 'Send anyway',
          cancelText: 'Cancel',
          variant: 'primary',
        });
        if (confirmResend) {
          await handleSendReminder(true);
        }
      } else {
        ui.toast.error(getApiErrorMessage(e, 'Failed to send reminder.'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleRescheduleDueDate = async () => {
    if (!newDueDate) {
      ui.toast.error('Please select a valid date.');
      return;
    }
    setSending(true);
    try {
      await api.invoicing.rescheduleDueDate(invoiceId, newDueDate);
      ui.toast.success(`Due date successfully rescheduled to ${formatDate(newDueDate)}.`);
      setRescheduling(false);
      onChanged();
      loadData();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not reschedule due date.'));
    } finally {
      setSending(false);
    }
  };

  const handleSendThankYou = async () => {
    setSendingThankYou(true);
    try {
      await api.invoicing.sendThankYou(invoiceId, {});
      ui.toast.success(`Thank you note sent to ${data?.invoice?.billToEmail || 'customer'}!`);
      onChanged();
      loadData();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not send thank you email.'));
    } finally {
      setSendingThankYou(false);
    }
  };

  const copyPaymentLink = () => {
    const invNo = data?.invoice?.invoiceNumber || invoiceId;
    const link = `https://pay.zenia.app/inv/${encodeURIComponent(String(invNo))}`;
    navigator.clipboard.writeText(link);
    ui.toast.success('Payment link copied to clipboard!');
  };

  if (loading || !data) {
    return (
      <Modal open onClose={onClose} title="Payment Reminder Center" size="xl">
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-8 h-8 text-[#C77E52] animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading real-time invoice calculations & reminder history…</p>
        </div>
      </Modal>
    );
  }

  const inv = data.invoice || {};
  const prog = data.progress || { total: 0, paid: 0, remaining: 0, percent: 0 };
  const autoStatus = data.autoStatus || 'Draft';
  const isPaid = prog.remaining <= 0 && autoStatus !== 'Draft';
  const isOverdue = autoStatus === 'Overdue' || (prog.remaining > 0 && data.overdueDays > 0);

  const statusBadgeVariant = (st: string) => {
    switch (st) {
      case 'Paid': return 'green';
      case 'Partially Paid': return 'amber';
      case 'Overdue': return 'red';
      case 'Pending Payment': return 'orange';
      case 'Sent': case 'Viewed': return 'blue';
      case 'Cancelled': case 'Closed': return 'gray';
      default: return 'gray';
    }
  };

  const statusIcon = (st: string) => {
    switch (st) {
      case 'Paid': return <CheckCircle2 size={14} className="text-emerald-600 inline mr-1" />;
      case 'Partially Paid': return <Clock size={14} className="text-amber-600 inline mr-1" />;
      case 'Overdue': return <AlertTriangle size={14} className="text-rose-600 inline mr-1" />;
      case 'Pending Payment': return <Clock size={14} className="text-orange-600 inline mr-1" />;
      case 'Sent': case 'Viewed': return <Eye size={14} className="text-blue-600 inline mr-1" />;
      case 'Cancelled': return <Ban size={14} className="text-slate-500 inline mr-1" />;
      default: return <FileText size={14} className="text-slate-400 inline mr-1" />;
    }
  };

  return (
    <Modal open onClose={onClose} title={`Payment Reminder Center · ${inv.invoiceNumber || ''}`} size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>
              Print Invoice
            </Button>
            <Button variant="outline" size="sm" icon={<Copy size={14} />} onClick={copyPaymentLink}>
              Copy Payment Link
            </Button>
            {onViewInvoice && (
              <Button variant="outline" size="sm" icon={<Eye size={14} />} onClick={() => { onClose(); onViewInvoice(); }}>
                View Invoice
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }>
      
      <div className="space-y-6 max-h-[78vh] overflow-y-auto pr-1">
        
        {/* REQUIREMENT 14: OVERDUE WARNING BANNER */}
        {isOverdue && !isPaid && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-rose-900 flex items-center gap-2">
                  ⚠ This invoice is OVERDUE by {data.overdueDays} days.
                  <span className="text-xs px-2 py-0.5 bg-rose-200 text-rose-800 rounded-full font-bold">Urgent Action Required</span>
                </h4>
                <p className="text-xs text-rose-700 mt-1 font-medium">
                  Original Due Date: <strong className="underline">{formatDate(inv.dueDate)}</strong> · Outstanding Amount: <strong className="text-rose-950 text-sm">{inr(prog.remaining)}</strong>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto justify-end">
              <Button size="sm" variant="outline" className="bg-white border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={() => { applyTemplatePreset('urgent'); setActiveTab('editor'); }}>
                Send Urgent Reminder
              </Button>
              <Button size="sm" variant="outline" className="bg-white border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={() => {
                  const phone = inv.billToPhone || data?.companyContact?.phone;
                  if (phone) window.open(`tel:${phone}`);
                  else ui.toast.info('No phone number recorded for this customer.');
                }}>
                <Phone size={13} className="mr-1" /> Call Customer
              </Button>
              <Button size="sm" variant="outline" className="bg-white border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={() => setRescheduling(!rescheduling)}>
                <Calendar size={13} className="mr-1" /> Reschedule
              </Button>
            </div>
            {rescheduling && (
              <div className="w-full pt-3 mt-2 border-t border-rose-200 flex items-center justify-end gap-2">
                <span className="text-xs font-bold text-rose-800">New Due Date:</span>
                <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-rose-300 rounded-lg bg-white font-semibold text-slate-800 outline-none" />
                <Button size="sm" onClick={handleRescheduleDueDate} loading={sending} className="bg-rose-600 hover:bg-rose-700 text-white">
                  Save Date
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRescheduling(false)}>Cancel</Button>
              </div>
            )}
          </div>
        )}

        {/* REQUIREMENT 13: CELEBRATORY FULLY PAID UI */}
        {isPaid ? (
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 border-2 border-emerald-300 rounded-3xl p-8 text-center shadow-md space-y-6">
            <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <PartyPopper size={40} className="animate-bounce" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-emerald-950 tracking-tight">
                🎉 Invoice Paid Successfully!
              </h2>
              <p className="text-sm font-medium text-emerald-800 max-w-md mx-auto">
                This invoice has been settled in full. No payment reminder can be sent for fully paid invoices.
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur border border-emerald-200 rounded-2xl p-6 max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-left shadow-sm">
              <div>
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Paid Amount</p>
                <p className="text-xl font-black text-emerald-900 mt-0.5">{inr(prog.paid)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Payment Date</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {data.payments && data.payments.length > 0 ? formatDate(data.payments[0].paymentDate) : formatDate(inv.updatedAt)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Payment Method</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {data.payments && data.payments.length > 0 ? data.payments[0].mode : 'Bank Transfer'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Receipt Number</p>
                <p className="text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-1">
                  REC-{inv.invoiceNumber}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="md" icon={<Download size={16} />} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow-sm"
                onClick={() => window.print()}>
                Download Receipt
              </Button>
              <Button size="md" variant="outline" icon={<HeartHandshake size={16} />} className="border-emerald-400 text-emerald-800 hover:bg-emerald-100 font-bold px-6"
                onClick={handleSendThankYou} loading={sendingThankYou}>
                Send Thank You Email
              </Button>
              {onViewInvoice && (
                <Button size="md" variant="ghost" icon={<Eye size={16} />} className="text-emerald-900 hover:bg-emerald-100"
                  onClick={() => { onClose(); onViewInvoice(); }}>
                  View Invoice
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* REQUIREMENT 2 & 4: INVOICE SUMMARY CARD & PROGRESS BAR (For unpaid / active invoices) */
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold text-xl shadow-inner shrink-0">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-slate-900">{inv.invoiceNumber}</h3>
                    <Badge variant={statusBadgeVariant(autoStatus) as any} className="text-xs font-bold px-2.5 py-0.5">
                      {statusIcon(autoStatus)}{autoStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">{inv.billToName}</span> · 
                    <span>{inv.billToEmail || 'No Email'}</span> · 
                    <span>{inv.billToPhone || 'No Phone'}</span>
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-[11px] uppercase font-bold text-slate-400">Grand Total</p>
                <p className="text-2xl font-black text-[#C77E52] tracking-tight">{inr(inv.grandTotal)}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Currency: <strong className="font-mono text-slate-700">{inv.currency || 'INR'}</strong> · Terms: <strong className="text-slate-700">{inv.paymentTerms || 'Net 30'}</strong>
                </p>
              </div>
            </div>

            {/* Progress Bar (Requirement 4) */}
            <div className="space-y-2 bg-slate-50/80 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Payment Progress ({prog.percent}%)
                </span>
                <span className="font-mono text-slate-600">
                  Paid: <strong className="text-emerald-600">{inr(prog.paid)}</strong> of {inr(prog.total)}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden p-0.5 shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${prog.percent === 100 ? 'bg-emerald-500' : prog.percent > 0 ? 'bg-gradient-to-r from-amber-500 to-emerald-500' : 'bg-transparent'}`}
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                <div className="bg-white p-2 rounded-lg border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Invoice Amount</span>
                  <span className="font-extrabold text-slate-800">{inr(prog.total)}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Paid Amount</span>
                  <span className="font-extrabold text-emerald-600">{inr(prog.paid)}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-150 bg-orange-50/40 border-orange-200/60">
                  <span className="text-[10px] text-orange-600 font-bold block uppercase">Remaining Due</span>
                  <span className="font-extrabold text-orange-700">{inr(prog.remaining)}</span>
                </div>
              </div>
            </div>

            {/* Detailed Figures Collapsible / Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs border-t border-slate-100">
              <div>
                <span className="text-slate-400 font-medium block">Invoice Date</span>
                <strong className="text-slate-700 font-semibold">{formatDate(inv.invoiceDate)}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Due Date</span>
                <strong className={`${isOverdue ? 'text-rose-600 font-extrabold' : 'text-slate-700 font-semibold'}`}>{formatDate(inv.dueDate)}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Tax (GST)</span>
                <strong className="text-slate-700 font-semibold">{inr((inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0))}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Discount</span>
                <strong className="text-slate-700 font-semibold">{inr(inv.discountTotal)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* NAVIGATION TABS (Only shown if unpaid, or user can inspect history) */}
        {!isPaid && (
          <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto scrollbar-hide pt-2">
            <button
              onClick={() => setActiveTab('editor')}
              className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'editor' ? 'border-[#C77E52] text-[#C77E52]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Send size={15} /> 1. Send Reminder
            </button>
            <button
              onClick={() => setActiveTab('email-preview')}
              className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'email-preview' ? 'border-[#C77E52] text-[#C77E52]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Mail size={15} /> 2. Email Preview
            </button>
            <button
              onClick={() => setActiveTab('whatsapp-preview')}
              className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'whatsapp-preview' ? 'border-[#C77E52] text-[#C77E52]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <MessageSquare size={15} /> 3. WhatsApp Preview
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'timeline' ? 'border-[#C77E52] text-[#C77E52]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <History size={15} /> 4. Payment Timeline & History
              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-mono">
                {(data.audits?.length || 0) + (data.payments?.length || 0)}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('reminder-history')}
              className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'reminder-history' ? 'border-[#C77E52] text-[#C77E52]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <ShieldCheck size={15} /> 5. Reminder History
              <span className="bg-brand-50 text-brand-700 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                {data.reminders?.length || 0}
              </span>
            </button>
          </div>
        )}

        {/* TAB 1: MESSAGE EDITOR & CHANNELS */}
        {!isPaid && activeTab === 'editor' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
            
            {/* Left Column: Channel & Attachment selections */}
            <div className="space-y-6 lg:col-span-1">
              
              {/* Communication Channels (Requirement 8) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Share2 size={14} className="text-[#C77E52]" /> Communication Channels
                </h4>
                <p className="text-[11px] text-slate-500">Select multiple channels for simultaneous delivery:</p>
                <div className="space-y-2">
                  {[
                    { id: 'Email', label: 'Email', icon: Mail, subtitle: inv.billToEmail || 'Missing email address', active: !!inv.billToEmail },
                    { id: 'WhatsApp', label: 'WhatsApp', icon: MessageSquare, subtitle: inv.billToPhone || 'Missing phone number', active: !!inv.billToPhone },
                    { id: 'SMS', label: 'SMS', icon: Smartphone, subtitle: inv.billToPhone || 'Missing phone number', active: !!inv.billToPhone },
                    { id: 'In-App Notification', label: 'In-App Notification', icon: Bell, subtitle: 'Instant portal dashboard alert', active: true },
                  ].map(ch => {
                    const selected = channels.includes(ch.id);
                    return (
                      <div
                        key={ch.id}
                        onClick={() => toggleChannel(ch.id)}
                        className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${selected ? 'bg-brand-50/70 border-brand-300 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border ${selected ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {selected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                            <ch.icon size={13} className={selected ? 'text-brand-600' : 'text-slate-400'} />
                            {ch.label}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">{ch.subtitle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attachments (Requirement 9) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <FileDown size={14} className="text-[#C77E52]" /> Attachments
                </h4>
                <p className="text-[11px] text-slate-500">Automatically bundle real-time documents:</p>
                <div className="space-y-1.5">
                  {[
                    { id: 'Attach Invoice PDF', label: 'Attach Invoice PDF', desc: 'Exact A4 printable document' },
                    { id: 'Attach Payment QR', label: 'Attach Payment QR', desc: 'UPI / Scan to pay code' },
                    { id: 'Attach Payment Link', label: 'Attach Payment Link', desc: '1-click checkout URL' },
                    { id: 'Attach Company Bank Details', label: 'Attach Bank Details', desc: 'NEFT / RTGS / IFSC details' },
                    { id: 'Attach Receipt', label: 'Attach Receipt (if partially paid)', desc: 'Rollup of received payments' },
                  ].map(att => {
                    const selected = attachments.includes(att.id);
                    return (
                      <div
                        key={att.id}
                        onClick={() => toggleAttachment(att.id)}
                        className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${selected ? 'bg-[#C77E52] border-[#C77E52] text-white' : 'border-slate-300 bg-white'}`}>
                          {selected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <div className="text-xs">
                          <span className="font-bold text-slate-800">{att.label}</span>
                          <span className="text-[10px] text-slate-400 block">{att.desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Template & Message Editor (Requirement 7) */}
            <div className="space-y-4 lg:col-span-2 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Reminder Message Editor</h4>
                    <p className="text-xs text-slate-500">Customize the template text before dispatching.</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400">Presets:</span>
                    <Button size="sm" variant={templateType === 'standard' ? 'primary' : 'outline'}
                      className={templateType === 'standard' ? 'bg-[#C77E52] text-white text-xs h-7 px-2' : 'text-xs h-7 px-2'}
                      onClick={() => applyTemplatePreset('standard')}>
                      Friendly
                    </Button>
                    <Button size="sm" variant={templateType === 'urgent' ? 'primary' : 'outline'}
                      className={templateType === 'urgent' ? 'bg-rose-600 text-white text-xs h-7 px-2' : 'text-xs h-7 px-2'}
                      onClick={() => applyTemplatePreset('urgent')}>
                      Urgent Overdue
                    </Button>
                    <Button size="sm" variant={templateType === 'short' ? 'primary' : 'outline'}
                      className={templateType === 'short' ? 'bg-brand-600 text-white text-xs h-7 px-2' : 'text-xs h-7 px-2'}
                      onClick={() => applyTemplatePreset('short')}>
                      Short Link
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Subject Line</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-[#C77E52] outline-none transition-all"
                      placeholder="Email subject line…"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-700">Message Body</label>
                      <span className="text-[10px] text-slate-400">Supported variables: {`{{CustomerName}}, {{InvoiceNumber}}, {{PendingAmount}}, {{DueDate}}`}</span>
                    </div>
                    <textarea
                      rows={10}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      className="w-full p-3 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-[#C77E52] outline-none transition-all leading-relaxed"
                      placeholder="Type reminder message…"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button & Rate Limit Notice */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                  <span>Verified customer info · Duplicate prevention active</span>
                </div>
                <Button
                  size="md"
                  icon={<Send size={15} />}
                  loading={sending}
                  onClick={() => handleSendReminder(false)}
                  className="bg-[#C77E52] hover:bg-[#b06f47] text-white font-extrabold px-8 w-full sm:w-auto shadow-sm"
                >
                  Send Reminder ({channels.length} {channels.length === 1 ? 'channel' : 'channels'})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EMAIL PREVIEW (Requirement 10) */}
        {!isPaid && activeTab === 'email-preview' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto space-y-6">
            <div className="border-b border-slate-200 pb-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">Email Client Preview</span>
                <span className="text-xs text-slate-400">Date: {new Date().toLocaleDateString('en-IN')}</span>
              </div>
              <p className="text-xs font-medium text-slate-600"><strong className="text-slate-900">To:</strong> {inv.billToEmail || 'customer@example.com'} ({inv.billToName})</p>
              <p className="text-xs font-medium text-slate-600"><strong className="text-slate-900">From:</strong> billing@{data.companyName?.toLowerCase().replace(/\s+/g, '') || 'company'}.com</p>
              <p className="text-sm font-black text-slate-900 pt-1"><strong className="text-slate-500 font-bold">Subject:</strong> {subject || `Payment Reminder - Invoice ${inv.invoiceNumber}`}</p>
            </div>

            {/* Email Body Preview */}
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#C77E52] text-white font-black rounded-lg flex items-center justify-center text-sm shadow">
                    {(data.companyName || 'C').charAt(0)}
                  </div>
                  <span className="font-extrabold text-slate-800 text-sm">{data.companyName || 'Our Company'}</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Payment Reminder</span>
              </div>

              <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-slate-700 leading-relaxed">
                {message || 'No message content defined.'}
              </div>

              {/* Attachments Checklist Preview */}
              {attachments.length > 0 && (
                <div className="pt-4 border-t border-slate-200/60 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Attached Files & Links:</p>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map(att => (
                      <span key={att} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                        <FileText size={13} className="text-[#C77E52]" /> {att}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Company Signature / Footer */}
              <div className="pt-6 border-t border-slate-200/60 text-xs text-slate-500 space-y-1">
                <p className="font-bold text-slate-800">{data.companyName || 'Our Company'} Accounts Team</p>
                <p className="text-[11px]">{data.companyContact?.phone ? `Phone: ${data.companyContact.phone}` : ''} {data.companyContact?.email ? `· Email: ${data.companyContact.email}` : ''}</p>
                <p className="text-[10px] text-slate-400 italic pt-2">This is an automated payment reminder sent via ZeniaHR Enterprise Invoicing.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WHATSAPP PREVIEW (Requirement 11) */}
        {!isPaid && activeTab === 'whatsapp-preview' && (
          <div className="bg-[#EFEAE2] border border-slate-200 rounded-3xl p-6 shadow-sm max-w-md mx-auto space-y-4">
            <div className="bg-[#075E54] text-white p-3 rounded-2xl flex items-center gap-3 shadow">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                {(inv.billToName || 'C').charAt(0)}
              </div>
              <div>
                <p className="text-xs font-bold">{inv.billToName || 'Customer'}</p>
                <p className="text-[10px] text-emerald-100">{inv.billToPhone || '+91 98765 43210'} · Official Business Account</p>
              </div>
            </div>

            {/* Chat bubble */}
            <div className="bg-[#DCF8C6] text-slate-900 p-4 rounded-2xl rounded-tl-none shadow-sm space-y-3 relative ml-2">
              <div className="text-xs font-sans whitespace-pre-wrap leading-relaxed">
                {message || 'No message content defined.'}
              </div>

              {/* Payment Link Card inside WhatsApp */}
              <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Instant Payment Link</p>
                <p className="text-xs font-black text-[#075E54]">pay.zenia.app/inv/{inv.invoiceNumber}</p>
                <p className="text-[11px] text-slate-600">Amount Due: <strong className="text-emerald-700 font-extrabold">{inr(prog.remaining)}</strong></p>
              </div>

              <div className="flex justify-end items-center gap-1 text-[10px] text-slate-500 pt-1">
                <span>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                <CheckCircle2 size={12} className="text-[#53BDEB]" />
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-500 font-medium">
              Simulated WhatsApp Business message preview.
            </p>
          </div>
        )}

        {/* TAB 4: TIMELINE & HISTORY (Requirements 5 & 6) */}
        {!isPaid && activeTab === 'timeline' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex gap-2">
                <Button size="sm" variant={timelineMode === 'all' ? 'primary' : 'outline'}
                  className={timelineMode === 'all' ? 'bg-[#C77E52] text-white text-xs' : 'text-xs'}
                  onClick={() => setTimelineMode('all')}>
                  Chronological Activity Timeline
                </Button>
                <Button size="sm" variant={timelineMode === 'payments' ? 'primary' : 'outline'}
                  className={timelineMode === 'payments' ? 'bg-[#C77E52] text-white text-xs' : 'text-xs'}
                  onClick={() => setTimelineMode('payments')}>
                  Payment Transactions History ({data.payments?.length || 0})
                </Button>
              </div>
            </div>

            {timelineMode === 'all' ? (
              /* Chronological Timeline (Requirement 5) */
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-4 ml-3">
                {(() => {
                  // Combine audits, payments, and reminders into a single sorted timeline
                  const events: any[] = [];
                  (data.audits || []).forEach((a: any) => events.push({
                    type: 'audit', date: a.createdAt, title: `Audit: ${a.action}`, user: a.performedBy || 'System', desc: a.details, icon: History, color: 'text-slate-500 bg-slate-100'
                  }));
                  (data.payments || []).forEach((p: any) => events.push({
                    type: 'payment', date: p.createdAt || p.paymentDate, title: `Payment Received (${p.mode})`, user: p.recordedBy || 'Accounts', desc: `${inr(p.amount)} recorded. Ref: ${p.referenceNumber || 'N/A'}. ${p.notes || ''}`, icon: IndianRupee, color: 'text-emerald-600 bg-emerald-100'
                  }));
                  (data.reminders || []).forEach((r: any) => events.push({
                    type: 'reminder', date: r.createdAt, title: `Reminder Sent via ${r.channel}`, user: r.sentBy || 'Admin', desc: `To: ${r.recipient}. Status: ${r.status}`, icon: Bell, color: 'text-brand-600 bg-brand-100'
                  }));

                  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (events.length === 0) {
                    return <p className="text-xs text-slate-400 py-4 italic">No activity recorded for this invoice yet.</p>;
                  }

                  return events.map((ev, idx) => {
                    const IconComp = ev.icon;
                    return (
                      <div key={idx} className="relative group">
                        <div className={`absolute -left-[31px] top-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${ev.color}`}>
                          <IconComp size={14} />
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-sm transition-shadow">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-slate-800">{ev.title}</span>
                            <span className="text-[10px] font-mono text-slate-400">{formatDateTime(ev.date)}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 font-medium">{ev.desc}</p>
                          <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                            <User size={11} /> Performed by: <strong className="text-slate-600">{ev.user}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              /* Payment History Table (Requirement 6) */
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Payment Method</th>
                      <th className="p-3">Reference No</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(!data.payments || data.payments.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No payments recorded yet.</td>
                      </tr>
                    ) : (
                      data.payments.map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                          <td className="p-3 font-bold text-slate-800">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              <CreditCard size={12} className="text-[#C77E52]" /> {p.mode}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-600">{p.referenceNumber || '—'}</td>
                          <td className="p-3 text-right font-black text-emerald-600">{inr(p.amount)}</td>
                          <td className="p-3 text-center">
                            <Badge variant={p.status === 'Paid' ? 'green' : 'amber'}>{p.status}</Badge>
                          </td>
                          <td className="p-3 text-slate-500 max-w-xs truncate" title={p.notes || ''}>{p.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: REMINDER HISTORY (Requirement 15) */}
        {!isPaid && activeTab === 'reminder-history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-800">Complete Reminder Dispatch History</h4>
                <p className="text-xs text-slate-500">Log of all multi-channel notifications sent for this invoice.</p>
              </div>
              <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={loadData}>Refresh</Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Channel</th>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Sent By</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Message Snippet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(!data.reminders || data.reminders.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">No reminders have been sent for this invoice yet.</td>
                    </tr>
                  ) : (
                    data.reminders.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                        <td className="p-3 font-bold text-slate-800">
                          <span className="inline-flex items-center gap-1.5">
                            {r.channel === 'Email' ? <Mail size={13} className="text-emerald-600" /> : r.channel === 'WhatsApp' ? <MessageSquare size={13} className="text-green-600" /> : <Bell size={13} className="text-[#C77E52]" />}
                            {r.channel}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{r.recipient || '—'}</td>
                        <td className="p-3 text-slate-700 font-medium">{r.sentBy || 'Admin'}</td>
                        <td className="p-3 text-center">
                          <Badge variant={r.status === 'Delivered' || r.status === 'Opened' ? 'green' : r.status === 'Failed' ? 'red' : 'blue'} dot>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate font-sans" title={r.message || ''}>
                          {r.message ? r.message.slice(0, 60) + '…' : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
};
