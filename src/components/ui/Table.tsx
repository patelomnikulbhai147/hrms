import React from 'react';
import { cn } from '../../utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className={cn('w-full overflow-x-auto border border-slate-200/80 rounded-xl shadow-sm bg-white', className)}>
    <table className="w-full text-sm border-collapse">{children}</table>
  </div>
);

export const Thead: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <thead className={cn('bg-slate-50/75 border-b border-slate-200/80', className)}>{children}</thead>
);

export const Tbody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-4 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap select-none', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }> = ({ children, className, onClick }) => (
  <td className={cn('px-4 py-3 text-slate-600 whitespace-nowrap text-xs font-medium', className)} onClick={onClick}>{children}</td>
);

export const Tr: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className, onClick }) => (
  <tr
    className={cn('hover:bg-slate-50/60 transition-colors duration-150', onClick && 'cursor-pointer active:bg-slate-100/50', className)}
    onClick={onClick}
  >
    {children}
  </tr>
);
