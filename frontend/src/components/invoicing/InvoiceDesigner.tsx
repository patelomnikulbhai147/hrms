import React, { useState } from 'react';
import CanvasInvoiceDesigner from './CanvasInvoiceDesigner';
import ClassicTemplateDesigner from './ClassicTemplateDesigner';

export const InvoiceDesigner: React.FC<{ company: any; canManage: boolean }> = (props) => {
  const [designerMode, setDesignerMode] = useState<'classic' | 'visual'>('classic');
  const [seedLayout, setSeedLayout] = useState<any>(null);

  const handleUseTemplate = (layoutData: any) => {
    setSeedLayout(layoutData);
    setDesignerMode('visual');
  };

  const handleBackToGallery = () => {
    setDesignerMode('classic');
    setSeedLayout(null);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-full gap-4">
      {/* Top Level Mode Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoice Designer</h1>
          <p className="text-sm text-slate-500 mt-1">Configure the look and feel of your generated invoices.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button 
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${designerMode === 'classic' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
            onClick={handleBackToGallery}
          >
            Classic Templates
          </button>
          <button 
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${designerMode === 'visual' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
            onClick={() => setDesignerMode('visual')}
          >
            Visual Designer
          </button>
        </div>
      </div>

      {/* Render selected designer */}
      {designerMode === 'classic' ? (
        <ClassicTemplateDesigner {...props} onUseTemplate={handleUseTemplate} />
      ) : (
        <CanvasInvoiceDesigner {...props} seedLayout={seedLayout} />
      )}
    </div>
  );
};

export default InvoiceDesigner;
