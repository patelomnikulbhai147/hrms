import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoice Designer</h1>
          <p className="text-sm text-slate-500 mt-1">Configure the look and feel of your generated invoices.</p>
        </div>
        {/* The visual designer is only reachable through "Use Template", so it needs its own way back. */}
        {designerMode === 'visual' && (
          <button
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800"
            onClick={handleBackToGallery}
          >
            <ArrowLeft size={16} />
            Back to Templates
          </button>
        )}
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
