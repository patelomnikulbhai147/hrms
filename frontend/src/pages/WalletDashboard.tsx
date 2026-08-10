import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, RefreshCw, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Clock, CreditCard, AlertTriangle, CheckCircle, Users, Zap, Filter, Download } from 'lucide-react';
import { api } from '@/api/apiClient';
import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';

// ── Types ───────────────────────────────────────────────────────────────────
interface WalletSummary {
  id: number;
  companyId: number;
  balance: number;
  lastRechargeAt: string | null;
  status: string;
  todaysUsage: number;
  thisMonthUsage: number;
  totalRecharge: number;
  totalDeduction: number;
}

interface WalletTransaction {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceNumber: string | null;
  paymentGateway: string | null;
  createdBy: string;
  createdAt: string;
}

interface Estimate {
  activeEmployees: number;
  costPerEmployee: number;
  totalCost: number;
  tier: { tierName: string; quarterlyPrice: number; yearlyPrice: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

const txIcon = (type: string, amount: number) => {
  if (type === 'Recharge') return <ArrowUpRight size={14} className="text-emerald-400" />;
  if (type === 'Refund') return <ArrowUpRight size={14} className="text-blue-400" />;
  return <ArrowDownRight size={14} className="text-rose-400" />;
};

const txColor = (amount: number) => amount >= 0 ? 'text-emerald-400' : 'text-rose-400';

// ── Component ─────────────────────────────────────────────────────────────────
interface WalletDashboardProps {
  role: string;
  /** When true, auto-open the recharge modal on mount (triggered from WalletBadge "Recharge Wallet"). */
  openRecharge?: boolean;
  /** Called after the auto-open flag is consumed, so App.tsx resets the flag. */
  onModalClose?: () => void;
}

export function WalletDashboard({ role, openRecharge, onModalClose }: WalletDashboardProps) {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [txFilter, setTxFilter] = useState<string>('All');
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState<string>('');
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [rechargeMsg, setRechargeMsg] = useState<string>('');
  const [rechargeError, setRechargeError] = useState<string>('');

  const canRecharge = ['Company Head', 'Super Admin'].includes(role);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, e] = await Promise.allSettled([
        api.wallet.getSummary(),
        api.wallet.getTransactions(),
        api.wallet.getEstimate(),
      ]);
      if (s.status === 'fulfilled') setSummary((s.value as any)?.data || null);
      if (t.status === 'fulfilled') {
        const d = (t.value as any)?.data;
        setTransactions(Array.isArray(d) ? d : d?.transactions || []);
      }
      if (e.status === 'fulfilled') setEstimate((e.value as any)?.data || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-open the recharge modal when navigated from the header "Recharge Wallet" button.
  useEffect(() => {
    if (openRecharge) {
      setRechargeOpen(true);
      setRechargeError('');
      setRechargeMsg('');
      setRechargeAmount('');
      // Consume the flag immediately so it doesn't re-trigger on re-renders.
      onModalClose?.();
    }
  }, [openRecharge]);

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) { setRechargeError('Please enter a valid amount'); return; }
    setRechargeLoading(true);
    setRechargeError('');
    setRechargeMsg('');
    try {
      const res = await api.wallet.createRechargeOrder({ amount }) as any;
      if (res?.payment_session_id) {
        // Load Cashfree SDK and open checkout
        const Cashfree = (window as any).Cashfree;
        if (Cashfree) {
          const cf = Cashfree({ mode: res.checkoutMode === 'PROD' ? 'production' : 'sandbox' });
          await cf.checkout({
            paymentSessionId: res.payment_session_id,
            returnUrl: `${window.location.origin}/wallet`,
          });
          setRechargeMsg('Payment initiated! Your wallet will be credited once payment is confirmed.');
          setRechargeOpen(false);
          setTimeout(fetchAll, 3000);
        } else {
          setRechargeError('Cashfree SDK not loaded. Please refresh the page and try again.');
        }
      } else {
        setRechargeError(res?.message || 'Failed to initiate payment');
      }
    } catch (err: any) {
      setRechargeError(err?.message || 'Recharge failed. Please try again.');
    } finally {
      setRechargeLoading(false);
    }
  };

  const filteredTx = txFilter === 'All' ? transactions : transactions.filter(t => t.type === txFilter);

  const isLow = summary && summary.balance < 1000;
  const isCritical = summary && summary.balance < 200;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="text-brand-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading Wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">

      {/* Cashfree SDK */}
      {typeof window !== 'undefined' && !document.getElementById('cashfree-sdk') && (() => {
        const s = document.createElement('script');
        s.id = 'cashfree-sdk';
        s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        document.head.appendChild(s);
        return null;
      })()}

      {/* ── Balance Card ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'md:col-span-1 rounded-2xl border p-6 relative overflow-hidden shadow-sm bg-white',
            isCritical ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-[#F1F5F9]'
          )}
        >
          {/* <div className="absolute top-0 right-0 w-32 h-32 opacity-5 rounded-bl-full bg-white pointer-events-none" /> */}
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <div className={cn('p-2 rounded-xl', isCritical ? 'bg-red-50' : isLow ? 'bg-amber-50' : 'bg-emerald-50')}>
              <Wallet size={18} className={isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-500'} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payroll Wallet</p>
              <p className="text-[10px] text-slate-400">Available Balance</p>
            </div>
          </div>
          <p className={cn('text-4xl font-black tracking-tight mb-1 relative z-10', isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-600')}>
            {summary ? fmt(summary.balance) : '—'}
          </p>
          <p className="text-[11px] text-slate-500 mb-4 relative z-10">
            Status: <span className={cn('font-bold', summary?.status === 'Active' ? 'text-emerald-600' : 'text-red-600')}>{summary?.status || 'Unknown'}</span>
            {summary?.lastRechargeAt && (
              <> · Last recharged {new Date(summary.lastRechargeAt).toLocaleDateString('en-IN')}</>
            )}
          </p>
          {isCritical && (
            <div className="relative z-10 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 mb-3">
              <AlertTriangle size={12} className="text-red-600 flex-shrink-0" />
              <p className="text-[11px] text-red-600 font-semibold">Critical: Payroll generation blocked</p>
            </div>
          )}
          {isLow && !isCritical && (
            <div className="relative z-10 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 mb-3">
              <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />
              <p className="text-[11px] text-amber-600 font-semibold">Low balance. Recharge soon!</p>
            </div>
          )}
          {canRecharge && (
            <button
              onClick={() => { setRechargeOpen(true); setRechargeError(''); setRechargeMsg(''); setRechargeAmount(''); }}
              className="relative z-10 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-all active:scale-95 shadow-md"
            >
              <Plus size={14} />
              Recharge Wallet
            </button>
          )}
        </motion.div>

        {/* ── Stats Grid ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="md:col-span-2 grid grid-cols-2 gap-4"
        >
          {[
            { label: "Today's Usage", value: summary ? fmt(summary.todaysUsage) : '—', icon: <Clock size={16} />, color: 'text-blue-500' },
            { label: 'This Month Usage', value: summary ? fmt(summary.thisMonthUsage) : '—', icon: <TrendingDown size={16} />, color: 'text-rose-500' },
            { label: 'Total Recharged', value: summary ? fmt(summary.totalRecharge) : '—', icon: <TrendingUp size={16} />, color: 'text-emerald-500' },
            { label: 'Estimated Next Run', value: estimate ? fmt(estimate.totalCost) : '—', icon: <Zap size={16} />, color: 'text-purple-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#F1F5F9] shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={stat.color}>{stat.icon}</span>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{stat.label}</p>
              </div>
              <p className="text-xl font-black text-slate-800">{stat.value}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Pricing Estimate ───────────────────────────────────────────────── */}
      {estimate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-[#F1F5F9] shadow-sm p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-brand-500" />
            <p className="text-sm font-extrabold text-slate-800">Payroll Cost Estimate</p>
            <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">{estimate.tier?.tierName}</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-slate-800">{estimate.activeEmployees}</p>
              <p className="text-[11px] text-slate-500">Active Employees</p>
            </div>
            <div className="text-center border-x border-[#F1F5F9]">
              <p className="text-2xl font-black text-brand-600">{fmt(estimate.costPerEmployee)}</p>
              <p className="text-[11px] text-slate-500">Per Employee/Month</p>
            </div>
            <div className="text-center">
              <p className={cn('text-2xl font-black', summary && summary.balance < estimate.totalCost ? 'text-red-500' : 'text-emerald-600')}>
                {fmt(estimate.totalCost)}
              </p>
              <p className="text-[11px] text-slate-500">Estimated Cost</p>
            </div>
          </div>
          {summary && summary.balance < estimate.totalCost && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <AlertTriangle size={14} className="text-red-600 flex-shrink-0" />
              <p className="text-xs text-red-600 font-semibold">
                Insufficient balance! Need {fmt(estimate.totalCost - summary.balance)} more to run payroll.
                {canRecharge && (
                  <button
                    onClick={() => setRechargeOpen(true)}
                    className="ml-2 underline text-brand-600 hover:text-brand-700"
                  >
                    Recharge now →
                  </button>
                )}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Transactions ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-[#F1F5F9] shadow-sm"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F1F5F9]">
          <CreditCard size={16} className="text-brand-500" />
          <p className="text-sm font-extrabold text-slate-800">Transaction History</p>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={txFilter}
              onChange={e => setTxFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {['All', 'Recharge', 'Payroll', 'Refund', 'Adjustment'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              onClick={fetchAll}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Wallet size={32} className="text-slate-300 mb-3" />
            <p className="text-slate-500 font-semibold text-sm">No transactions found</p>
            <p className="text-slate-400 text-xs mt-1">
              {txFilter !== 'All' ? `No ${txFilter} transactions yet` : 'Recharge your wallet to get started'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {filteredTx.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                  tx.amount >= 0 ? 'bg-emerald-50' : 'bg-rose-50'
                )}>
                  {txIcon(tx.type, tx.amount)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{tx.type}</p>
                    {tx.paymentGateway && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                        {tx.paymentGateway}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Clock size={9} />
                    {new Date(tx.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {tx.referenceNumber && <> · Ref: {tx.referenceNumber}</>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn('text-sm font-bold', tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {tx.amount >= 0 ? '+' : ''}{fmt(tx.amount)}
                  </p>
                  <p className="text-[10px] text-slate-500">Bal: {fmt(tx.balanceAfter)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Recharge Modal ─────────────────────────────────────────────────── */}
      {rechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-brand-50">
                <Wallet size={18} className="text-brand-600" />
              </div>
              <div>
                <p className="text-base font-extrabold text-slate-900">Recharge Wallet</p>
                <p className="text-xs text-slate-500">Add payroll credits via Cashfree</p>
              </div>
              <button
                onClick={() => setRechargeOpen(false)}
                className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Quick amounts */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 font-semibold mb-2 uppercase tracking-wider">Quick Select</p>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setRechargeAmount(String(amt))}
                    className={cn(
                      'py-2 rounded-xl text-xs font-bold transition-all border',
                      rechargeAmount === String(amt)
                        ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-brand-500 hover:bg-slate-50'
                    )}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-slate-500 font-semibold block mb-1.5 uppercase tracking-wider">
                Custom Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  min="1"
                  value={rechargeAmount}
                  onChange={e => setRechargeAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {rechargeError && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">{rechargeError}</p>
              </div>
            )}

            {rechargeMsg && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-emerald-600 font-medium">{rechargeMsg}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setRechargeOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRecharge}
                disabled={rechargeLoading || !rechargeAmount}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 shadow-md"
              >
                {rechargeLoading ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                {rechargeLoading ? 'Processing...' : 'Continue'}
              </button>
            </div>

            <p className="text-[10px] text-slate-500 text-center mt-3 font-medium">
              🔒 Secured by Cashfree Payment Gateway · PCI-DSS Compliant
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
