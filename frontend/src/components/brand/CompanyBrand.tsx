import React from 'react';
import { cn } from '@/utils/cn';
import { ZeniaLogo } from './ZeniaLogo';

/**
 * Company logo tile. Falls back to the ZeniaHR mark when the company has not
 * uploaded one, so the header is never empty.
 *
 * `object-contain` (not `cover`) — an uploaded logo must never be stretched or
 * cropped, and a transparent PNG keeps its transparency.
 */
export const CompanyLogo: React.FC<{ logo?: string; name?: string; size?: number; className?: string }> = ({
  logo, name, size = 44, className,
}) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [logo]);

  const showLogo = !!logo && !broken;

  return (
    <div
      className={cn('flex-shrink-0 rounded-[11px] overflow-hidden flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {showLogo ? (
        <img
          src={logo}
          alt={name ? `${name} logo` : 'Company logo'}
          onError={() => setBroken(true)}
          className="w-full h-full object-contain"
        />
      ) : (
        // No company logo on file → the platform mark.
        <ZeniaLogo size={size} radius={220} className="rounded-[11px]" />
      )}
    </div>
  );
};

interface CompanyBrandProps {
  name: string;
  role: string;
  logo?: string;
  /** Collapsed sidebar: mark only. */
  compact?: boolean;
  size?: number;
  className?: string;
  /** 'onDark' renders light text for the dark-slate sidebar. */
  tone?: 'default' | 'onDark';
}

/** Logo + company name (max 2 lines, full name on hover) + the user's role. */
export const CompanyBrand: React.FC<CompanyBrandProps> = ({ name, role, logo, compact, size = 44, className, tone = 'default' }) => (
  <div className={cn('flex items-center gap-3 min-w-0', className)}>
    <CompanyLogo logo={logo} name={name} size={size} className={tone === 'onDark' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]' : undefined} />
    {!compact && (
      <div className="min-w-0 flex-1">
        <p
          className={cn('leading-snug font-heading', tone === 'onDark' ? 'text-[16px] font-semibold text-[#FFFFFF]' : 'text-[14px] font-bold text-ink')}
          title={name}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {name}
        </p>
        <p className={cn('mt-0.5 truncate', tone === 'onDark' ? 'text-[13px] font-normal text-[#CBD5E1]' : 'text-[11px] font-semibold text-ink-secondary')}>{role}</p>
      </div>
    )}
  </div>
);
