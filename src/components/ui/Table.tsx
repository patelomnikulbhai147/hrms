import React from 'react';
import { cn } from '../../utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className={cn('w-full overflow-x-auto', className)}>
    <table className="w-full text-sm border-collapse">{children}</table>
  </div>
);

export const Thead: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <thead className={cn('bg-gray-50 border-b border-gray-200', className)}>{children}</thead>
);

export const Tbody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-gray-100">{children}</tbody>
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }> = ({ children, className, onClick }) => (
  <td className={cn('px-3 py-2.5 text-gray-700 whitespace-nowrap', className)} onClick={onClick}>{children}</td>
);

export const Tr: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className, onClick }) => (
  <tr
    className={cn('hover:bg-gray-50 transition-colors', onClick && 'cursor-pointer', className)}
    onClick={onClick}
  >
    {children}
  </tr>
);
