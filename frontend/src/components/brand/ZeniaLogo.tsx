import React from 'react';
import { cn } from '@/utils/cn';

/**
 * ZeniaHR brand mark.
 *
 * The geometry is fixed — do not restyle it. The diagonal is drawn first so the
 * two white bars overlay its ends, which is what makes the "Z" read cleanly.
 */

export const BRAND_NAME = 'ZeniaHR';
export const BRAND_TAGLINE = 'Enterprise HRMS';

interface LogoProps {
  /** Rendered edge length in px. */
  size?: number;
  className?: string;
  /** Corner rounding in px, on the 1024-unit grid. 0 = hard square. */
  radius?: number;
}

export const ZeniaLogo: React.FC<LogoProps> = ({ size = 32, className, radius = 180 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={`${BRAND_NAME} logo`}
    className={cn('flex-shrink-0', className)}
  >
    {/* White tile — reads on both light and dark chrome, with a slate hairline. */}
    <rect width="1024" height="1024" rx={radius} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="8" />

    {/* Diagonal stroke of the Z — copper, sits beneath the bars. */}
    <line
      x1="682" y1="422" x2="332" y2="678"
      stroke="#C77E52" strokeWidth="82" strokeLinecap="round"
    />

    {/* Upper and lower bars of the Z — slate ink. */}
    <rect x="298" y="388" width="418" height="72" rx="36" fill="#1E293B" />
    <rect x="298" y="644" width="418" height="72" rx="36" fill="#1E293B" />

    {/* The tittle — slate ink. */}
    <circle cx="511" cy="240" r="76" fill="#1E293B" />
  </svg>
);

interface LockupProps {
  size?: number;
  className?: string;
  /** Hide the wordmark (collapsed sidebar, mobile). */
  markOnly?: boolean;
  subtitle?: string;
}

/** Logo + wordmark, for sidebar headers, login and splash screens. */
export const ZeniaLockup: React.FC<LockupProps> = ({ size = 36, className, markOnly, subtitle }) => (
  <div className={cn('flex items-center gap-2.5', className)}>
    <ZeniaLogo size={size} radius={220} className="shadow-[0_4px_12px_rgba(199,126,82,0.25)] rounded-[22%]" />
    {!markOnly && (
      <div className="min-w-0 leading-tight">
        <div className="font-heading font-bold tracking-tight text-ink truncate" style={{ fontSize: size * 0.44 }}>
          {BRAND_NAME}
        </div>
        {subtitle && (
          <div className="text-ink-muted font-medium truncate" style={{ fontSize: size * 0.28 }}>
            {subtitle}
          </div>
        )}
      </div>
    )}
  </div>
);
