import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
  id?: string;
}

export const Card: React.FC<CardProps> = ({ children, className, padding = true, onClick, id }) => (
  <div
    id={id}
    className={cn(
      'bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-800/80 shadow-2xl transition-all duration-300 text-slate-100 relative overflow-hidden group',
      onClick && 'cursor-pointer hover:shadow-indigo-500/10 hover:border-slate-700 hover:-translate-y-1 active:scale-[0.99]',
      padding && 'p-5.5',
      className
    )}
    onClick={onClick}
  >
    {/* Dynamic hovering subtle glow accent */}
    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    {children}
  </div>
);

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, sub }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-800/80 shadow-2xl p-5.5 flex items-start gap-4 hover:shadow-indigo-500/10 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 text-slate-100 relative overflow-hidden group">
    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    <div className={cn('p-3.5 rounded-xl flex-shrink-0 text-white shadow-lg', color)}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-extrabold text-white mt-1.5 font-heading tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1 font-medium">{sub}</p>}
    </div>
  </div>
);

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
    <div>
      <h2 className="text-lg font-extrabold text-white tracking-tight font-heading">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">{actions}</div>}
  </div>
);
