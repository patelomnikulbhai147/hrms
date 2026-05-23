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
      'bg-white rounded-xl border border-slate-200/80 shadow-sm transition-all duration-300',
      onClick && 'cursor-pointer hover:shadow-md hover:shadow-slate-200/50 hover:border-slate-300 hover:-translate-y-0.5 active:scale-[0.99]',
      padding && 'p-5',
      className
    )}
    onClick={onClick}
  >
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
  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex items-start gap-4 hover:shadow-md hover:shadow-slate-200/50 hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-300">
    <div className={cn('p-3 rounded-lg flex-shrink-0 text-white shadow-sm shadow-current/10', color)}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1 font-medium">{sub}</p>}
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
      <h2 className="text-lg font-bold text-slate-900 tracking-tight font-heading">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">{actions}</div>}
  </div>
);
