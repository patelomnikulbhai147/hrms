import React from 'react';
import { X, ArrowRightLeft } from 'lucide-react';

interface TemplateComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  oldVersionContent: string;
  newVersionContent: string;
  oldVersionNumber: number;
  newVersionNumber: number;
}

export const TemplateComparisonModal = ({
  isOpen,
  onClose,
  oldVersionContent,
  newVersionContent,
  oldVersionNumber,
  newVersionNumber
}: TemplateComparisonModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 text-slate-700">
            <ArrowRightLeft size={20} />
            <h3 className="font-bold">Template Comparison</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded">
            <X size={18} />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden bg-slate-100 p-4 gap-4">
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-rose-800">Version {oldVersionNumber} (Previous)</span>
            </div>
            <div className="flex-1 overflow-auto p-6" dangerouslySetInnerHTML={{ __html: oldVersionContent }} />
          </div>
          
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-800">Version {newVersionNumber} (Selected)</span>
            </div>
            <div className="flex-1 overflow-auto p-6" dangerouslySetInnerHTML={{ __html: newVersionContent }} />
          </div>
        </div>
      </div>
    </div>
  );
};
