import React from 'react';
import { HardHat } from 'lucide-react';
import { PageId, MODULE_REGISTRY } from '@/config/moduleRegistry';

interface ModulePlaceholderProps {
  pageId: PageId;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({ pageId }) => {
  const moduleEntry = MODULE_REGISTRY.find(m => m.id === pageId);
  const title = moduleEntry?.label || 'Module';
  const Icon = moduleEntry?.icon || <HardHat size={48} className="text-brand-500 mb-4" />;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-[70vh]">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium tracking-wide">
          <span>Home</span>
          <span className="text-slate-300">/</span>
          <span className="text-brand-600">{title}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center mb-6 border-8 border-brand-50/50 shadow-inner">
          <div className="text-brand-500 scale-[2]">
            {Icon}
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-slate-900 mb-3">
          {title}
        </h2>
        
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold tracking-wider uppercase mb-6 shadow-sm border border-amber-200">
          <span aria-hidden>🚧</span> Module under development
        </div>
        
        <p className="max-w-lg text-slate-500 text-lg leading-relaxed">
          We are currently working hard to bring you the new <span className="font-semibold text-slate-700">{title}</span> capabilities. This feature will be available in an upcoming release.
        </p>
      </div>
    </div>
  );
};
