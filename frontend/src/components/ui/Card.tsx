import React from 'react';
import { cn } from '@/utils/cn';

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
      'bg-surface rounded-card border border-hairline shadow-card text-ink relative overflow-hidden',
      'transition-[box-shadow,transform,border-color] duration-200',
      onClick && 'cursor-pointer hover:shadow-card-hover hover:border-brand-200 hover:-translate-y-0.5 active:translate-y-0',
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
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, sub }) => (
  <div className="group bg-surface rounded-card border border-hairline shadow-card p-5 flex items-start gap-4 text-ink relative overflow-hidden transition-[box-shadow,transform,border-color] duration-200 hover:shadow-card-hover hover:border-brand-200 hover:-translate-y-0.5">
    {/* Brand accent, revealed on hover. */}
    <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

    <div className={cn('p-3 rounded-xl flex-shrink-0 text-white shadow-sm', color)}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-ink-secondary font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-ink mt-1 font-heading tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1 font-medium">{sub}</p>}
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
      <h2 className="text-lg font-bold text-ink tracking-tight font-heading">{title}</h2>
      {subtitle && <p className="text-[13px] text-ink-secondary mt-0.5 font-medium">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">{actions}</div>}
  </div>
);
