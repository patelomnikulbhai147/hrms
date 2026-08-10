import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet, TrendingUp, AlertTriangle, Plus, X, ArrowUpRight, ArrowDownRight, RefreshCw, CreditCard, Clock } from 'lucide-react';
import { api } from '@/api/apiClient';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useDismissable } from '@/hooks/useDismissable';

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
  walletId: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceNumber: string | null;
  paymentGateway: string | null;
  createdBy: string;
  createdAt: string;
}

interface WalletBadgeProps {
  role: string;
  activeCompanyId: string;
  onNavigateToWallet?: (action?: 'recharge' | 'view') => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export const WalletBadge: React.FC<WalletBadgeProps> = ({ role, activeCompanyId, onNavigateToWallet }) => {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const walletRef = useRef<HTMLDivElement>(null);
  const closeWallet = useCallback(() => setOpen(false), []);
  useDismissable(open, closeWallet, walletRef);

  // Only show for Company Head and HR
  const shouldShow = ['Company Head', 'HR', 'Super Admin'].includes(role);
  // Super Admin doesn't have a wallet
  if (role === 'Super Admin') return null;
  if (!shouldShow) return null;

  const fetchSummary = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await (api as any).wallet?.getSummary?.();
      if (res?.data) setSummary(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await (api as any).wallet?.getTransactions?.();
      if (res?.data) setTransactions(res.data.slice(0, 10));
    } catch {
      // silent
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const handleOpen = () => {
    setOpen(p => !p);
    if (!open) fetchTransactions();
  };

  const isLow = summary && summary.balance < 1000;
  const isCritical = summary && summary.balance < 200;

  return (
    <div className="relative" ref={walletRef}>
      <button
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 border',
          isCritical
            ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
            : isLow
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
        )}
        title="Wallet Balance"
      >
        <Wallet size={13} className="flex-shrink-0" />
        {loading ? (
          <span className="opacity-60">...</span>
        ) : summary ? (
          <span>{formatCurrency(summary.balance)}</span>
        ) : (
          <span className="opacity-60">Wallet</span>
        )}
        {isCritical && <AlertTriangle size={11} className="text-red-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'p-1.5 rounded-lg',
                  isCritical ? 'bg-red-500/20' : isLow ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                )}>
                  <Wallet size={14} className={isCritical ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-white tracking-wide uppercase">Payroll Wallet</p>
                  <p className="text-[10px] text-slate-400">Payroll Credits Balance</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Balance */}
            <div className={cn(
              'px-4 py-4 border-b border-slate-800',
              isCritical ? 'bg-red-950/20' : isLow ? 'bg-amber-950/20' : 'bg-emerald-950/10'
            )}>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Available Balance</p>
              <p className={cn(
                'text-2xl font-black tracking-tight',
                isCritical ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'
              )}>
                {summary ? formatCurrency(summary.balance) : '—'}
              </p>
              {isCritical && (
                <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1 font-semibold">
                  <AlertTriangle size={10} />
                  Critical: Payroll may be blocked
                </p>
              )}
              {isLow && !isCritical && (
                <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 font-semibold">
                  <AlertTriangle size={10} />
                  Low balance: Recharge soon
                </p>
              )}
            </div>

            {/* Stats */}
            {summary && (
              <div className="grid grid-cols-2 gap-0 border-b border-slate-800">
                <div className="px-4 py-3 border-r border-slate-800">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">This Month Used</p>
                  <p className="text-sm font-bold text-slate-200 mt-0.5">{formatCurrency(summary.thisMonthUsage)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Total Recharged</p>
                  <p className="text-sm font-bold text-slate-200 mt-0.5">{formatCurrency(summary.totalRecharge)}</p>
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Recent Transactions</p>
              {txLoading ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw size={14} className="text-slate-500 animate-spin" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-3 text-center">No transactions yet</p>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                          tx.amount > 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                        )}>
                          {tx.amount > 0
                            ? <ArrowUpRight size={10} className="text-emerald-400" />
                            : <ArrowDownRight size={10} className="text-rose-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-300 truncate">{tx.type}</p>
                          <p className="text-[9px] text-slate-500 flex items-center gap-1">
                            <Clock size={8} />
                            {new Date(tx.createdAt).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        'text-[11px] font-bold flex-shrink-0',
                        tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-slate-800 flex gap-2">
              {onNavigateToWallet && (
                <button
                  onClick={() => { setOpen(false); onNavigateToWallet('recharge'); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all active:scale-95"
                >
                  <Plus size={12} />
                  Recharge Wallet
                </button>
              )}
              <button
                onClick={() => { setOpen(false); onNavigateToWallet?.('view'); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all active:scale-95"
              >
                <CreditCard size={12} />
                View All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
