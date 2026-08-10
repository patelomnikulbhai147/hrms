import React from 'react';

export const ModuleLayout = ({ children, title }: { children: React.ReactNode, title?: string }) => {
  return (
    <div className="p-6">
      {title && <h2 className="text-2xl font-bold mb-4">{title}</h2>}
      {children}
    </div>
  );
};
