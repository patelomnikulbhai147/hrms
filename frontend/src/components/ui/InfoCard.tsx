import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Soft, branded summary widget — the standard for every "label + value" tile
 * (Leave analytics, payroll summaries, attendance rollups, …).
 *
 * Tones carry meaning, so pick by what the number *is*, not by variety:
 *   purple → general information   blue  → analytics
 *   green  → positive metrics      amber → warnings      red → critical
 *
 * Colours live in the `.info-tile` / `.tile-*` rules in index.css so both
 * themes are driven from one place.
 */

export type InfoTone = 'purple' | 'blue' | 'green' | 'amber' | 'red';

const toneClass: Record<InfoTone, string> = {
  purple: 'tile-purple',
  blue: 'tile-blue',
  green: 'tile-green',
  amber: 'tile-amber',
  red: 'tile-red',
};

interface InfoCardProps {
  label: string;
  /** Rendered as-is unless it is empty / a "no value" sentinel. */
  value?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: InfoTone;
  className?: string;
  /** Shown when `value` carries no information. */
  emptyText?: string;
}

/** Values the app already uses to mean "nothing to show". */
const EMPTY_SENTINELS = new Set(['', 'none', 'n/a', 'na', '-', '—', 'null', 'undefined']);

const isEmpty = (v: React.ReactNode) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && EMPTY_SENTINELS.has(v.trim().toLowerCase()));

export const InfoCard: React.FC<InfoCardProps> = ({
  label, value, icon, tone = 'purple', className, emptyText = 'No Data Available',
}) => {
  const empty = isEmpty(value);

  return (
    <div className={cn('info-tile p-4', toneClass[tone], className)}>
      <div className="flex items-center gap-2">
        {icon && <span className="tile-icon flex-shrink-0 flex items-center">{icon}</span>}
        <p className="tile-title text-[11px] uppercase tracking-wide leading-tight">{label}</p>
      </div>

      {empty ? (
        <p className="tile-empty text-[13px] mt-2 italic">{emptyText}</p>
      ) : (
        <p className="tile-value text-[15px] mt-2 leading-snug break-words">{value}</p>
      )}
    </div>
  );
};
