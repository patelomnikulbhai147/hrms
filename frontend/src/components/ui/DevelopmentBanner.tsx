import React from 'react';
import { Info, FlaskConical, Wrench } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// DevelopmentBanner — a permanent, NON-DISMISSIBLE status notice used to flag a
// module as still under active development (or in beta / maintenance).
//
// This is intentionally not dismissible: the notice is critical information and
// must remain visible until developers remove the <DevelopmentBanner /> from the
// module's JSX. There is no close button and no localStorage/session state — the
// banner cannot be hidden by the user and always reappears after a refresh.
//
// Reuse it across modules for consistent UI:
//   <DevelopmentBanner status="development" message="..." />
//   <DevelopmentBanner status="beta" title="Beta version" message="..." />
//   <DevelopmentBanner status="maintenance" message="..." />
// ─────────────────────────────────────────────────────────────────────────────

export type DevelopmentBannerStatus = 'development' | 'beta' | 'maintenance';

interface StatusConfig {
  emoji: string;
  defaultTitle: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

// Single source of truth for the three supported statuses. Add future statuses
// here and every consumer picks them up automatically.
const STATUS_CONFIG: Record<DevelopmentBannerStatus, StatusConfig> = {
  development: { emoji: '🚧', defaultTitle: 'Work in Progress',      icon: Info },
  beta:        { emoji: '🧪', defaultTitle: 'Beta Version',          icon: FlaskConical },
  maintenance: { emoji: '🛠', defaultTitle: 'Scheduled Maintenance', icon: Wrench },
};

export interface DevelopmentBannerProps {
  /** Which status style/label to show. Defaults to `development`. */
  status?: DevelopmentBannerStatus;
  /** Optional title override — falls back to the status's default title. */
  title?: string;
  /** The body message describing what's still in progress. */
  message: string;
  /** Optional extra classes (e.g. spacing) merged onto the outer container. */
  className?: string;
}

/**
 * Permanent yellow information banner. Same design language as the rest of the
 * HRMS (rounded-2xl, amber palette, info icon, responsive). No dismiss control
 * by design — see the file header.
 */
export const DevelopmentBanner: React.FC<DevelopmentBannerProps> = ({
  status = 'development',
  title,
  message,
  className = '',
}) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.development;
  const Icon = cfg.icon;
  const heading = title || cfg.defaultTitle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm ${className}`}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-amber-800">
          <span aria-hidden className="mr-1">{cfg.emoji}</span>{heading}
        </p>
        <p className="text-[11px] leading-relaxed text-amber-700">{message}</p>
      </div>
    </div>
  );
};

export default DevelopmentBanner;
