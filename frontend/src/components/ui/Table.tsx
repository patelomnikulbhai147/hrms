import React from 'react';
import { cn } from '@/utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Tighter horizontal cell padding for wide tables (10+ columns), where the
   * default 16px-per-side costs 320px of pure whitespace and pushes the table
   * into horizontal scroll on a 1366px screen.
   *
   * Implemented as a CSS custom property rather than a class override so Th/Td
   * stay single-source: they read `--cell-px` and fall back to the normal 1rem,
   * so every existing table is byte-for-byte unchanged.
   */
  dense?: boolean;
}

export const Table: React.FC<TableProps> = ({ children, className, dense }) => (
  // `@container/table` lets cell content adapt to the SPACE THE TABLE ACTUALLY
  // HAS rather than to the viewport. With a 256px sidebar, a 1366px screen gives
  // the table ~1058px — a `lg:` (1024px viewport) rule fires there and renders
  // wide content that does not fit. Descendants can now ask the real question:
  // `@[1100px]/table:…`.
  <div
    className={cn('@container/table w-full overflow-x-auto border border-hairline rounded-card shadow-card bg-surface', className)}
    style={dense ? ({ ['--cell-px' as any]: '0.625rem' }) : undefined}
  >
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

// `px-[var(--cell-px,1rem)]` === the previous `px-4` unless a parent <Table dense>
// sets the variable. Keeps one padding definition for every table in the app.
export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-[var(--cell-px,1rem)] py-3 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wide whitespace-nowrap select-none', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void; colSpan?: number }> = ({ children, className, onClick, colSpan }) => (
  <td colSpan={colSpan} className={cn('px-[var(--cell-px,1rem)] py-3 text-ink whitespace-nowrap text-[13px] font-medium', className)} onClick={onClick}>{children}</td>
);

interface TrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children?: React.ReactNode;
  className?: string;
  onClick?: (e?: any) => void;
}

export const Tr: React.FC<TrProps> = ({ children, className, onClick, ...props }) => (
  // `bg-surface` on odd rows is visually identical to the previous transparent
  // background (the table sits on --surface), but it makes the row background
  // EXPLICIT — which is what lets a sticky cell use `bg-inherit` and stay opaque
  // while the rest of the row scrolls underneath it. Without it, sticky cells on
  // odd rows would be see-through.
  <tr
    className={cn('transition-colors duration-150 bg-surface even:bg-[color-mix(in_srgb,var(--surface-muted)_45%,transparent)]', onClick && 'cursor-pointer', className)}
    onClick={onClick}
    {...props}
  >
    {children}
  </tr>
);
