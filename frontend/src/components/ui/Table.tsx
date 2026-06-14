import React from 'react';
import { cn } from '../../utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className={cn('w-full overflow-x-auto border border-slate-800/80 rounded-2xl shadow-2xl bg-slate-900/40 backdrop-blur-xl', className)}>
    <table className="w-full text-sm border-collapse">{children}</table>
  </div>
);

export const Thead: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <thead className={cn('bg-slate-950/40 border-b border-slate-800/80', className)}>{children}</thead>
);

export const Tbody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-slate-800/50 bg-transparent">{children}</tbody>
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-4 py-3.5 text-left text-[10px] font-extrabold text-slate-400 uppercase tracking-wider whitespace-nowrap select-none', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void; colSpan?: number }> = ({ children, className, onClick, colSpan }) => (
  <td colSpan={colSpan} className={cn('px-4 py-3 text-slate-300 whitespace-nowrap text-xs font-semibold', className)} onClick={onClick}>{children}</td>
);

export const Tr: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className, onClick }) => (
  <tr
    className={cn('hover:bg-slate-800/30 transition-colors duration-150', onClick && 'cursor-pointer active:bg-slate-850/50', className)}
    onClick={onClick}
  >
    {children}
  </tr>
);
