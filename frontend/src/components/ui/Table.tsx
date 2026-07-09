import React from 'react';
import { cn } from '@/utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className={cn('w-full overflow-x-auto border border-hairline rounded-card shadow-card bg-surface', className)}>
    <table className="w-full text-sm border-collapse">{children}</table>
  </div>
);

/** Header sticks while the body scrolls inside the rounded container. */
export const Thead: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <thead className={cn('sticky top-0 z-10 bg-surface-muted border-b border-hairline', className)}>{children}</thead>
);

export const Tbody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-hairline">{children}</tbody>
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-4 py-3 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wide whitespace-nowrap select-none', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void; colSpan?: number }> = ({ children, className, onClick, colSpan }) => (
  <td colSpan={colSpan} className={cn('px-4 py-3 text-ink whitespace-nowrap text-[13px] font-medium', className)} onClick={onClick}>{children}</td>
);

export const Tr: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className, onClick }) => (
  <tr
    className={cn('transition-colors duration-150 even:bg-[color-mix(in_srgb,var(--surface-muted)_45%,transparent)]', onClick && 'cursor-pointer', className)}
    onClick={onClick}
  >
    {children}
  </tr>
);
