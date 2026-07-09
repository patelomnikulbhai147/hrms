import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { resolveDesign, invoiceDocHtml, SAMPLE_INVOICE } from './invoiceTemplate';
import { MASTER_TEMPLATES, CATEGORIES, TemplateDef } from './constants/masterTemplates';
import { Save } from 'lucide-react';
import { qrDataUrl } from '@/utils/cardCodes';

export const ClassicTemplateDesigner: React.FC<{ company: any; canManage: boolean; onUseTemplate?: (layout: any) => void }> = ({ company, canManage, onUseTemplate }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDef | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState<string>('');

  useEffect(() => {
    setQrData(qrDataUrl(SAMPLE_INVOICE.invoiceNumber, 200));
    (async () => {
      try { 
        setSelectedTemplate(MASTER_TEMPLATES[0]);
      }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, [company]);

  const handleUseTemplate = () => {
    if (!onUseTemplate || !selectedTemplate) return;
    // Pass the raw canvas elements to the visual designer
    onUseTemplate({ elements: selectedTemplate.elements });
  };

  if (loading || !selectedTemplate) return <Card><div className="p-4 text-center">Loading Classic Designer...</div></Card>;

  // Build a pseudo InvoiceDesign for the preview engine
  const previewDesign = {
    isCanvas: true,
    elements: selectedTemplate.elements,
    // Minimal mock for the renderer to not crash if it checks base properties
    template: 'canvas', paper: 'A4', orientation: 'portrait', title: '', 
    colors: {} as any, font: {} as any, layout: {} as any, 
    header: {} as any, footer: {} as any, columns: [], totals: {} as any
  } as any;

  const previewHtml = invoiceDocHtml(SAMPLE_INVOICE, company, previewDesign, { print: false, qrDataUrl: qrData });

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-white border-b border-slate-200 shrink-0">
        <h2 className="font-bold text-slate-800 ml-2">Master Template Library</h2>
        <div className="flex items-center gap-2">
           <span className="text-xs text-slate-500 mr-4">These professional templates are read-only.</span>
           <Button 
             size="sm" 
             className="bg-brand-600 hover:bg-brand-700 text-white font-medium"
             onClick={handleUseTemplate}
             disabled={!canManage}
           >
             Use Template
           </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="flex border-b border-slate-200">
            <div className="flex-1 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Gallery</div>
          </div>
          
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <select 
              className="w-full text-xs p-1.5 border border-slate-200 rounded text-slate-700 bg-white outline-none"
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-6">
              {['All', ...CATEGORIES].filter(cat => activeCategory === 'All' || activeCategory === cat).map(cat => {
                const templates = MASTER_TEMPLATES.filter(t => cat === 'All' ? true : t.category === cat);
                if (templates.length === 0 && cat !== 'All') return null;
                return (
                  <div key={cat}>
                    {cat !== 'All' && <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">{cat}</h3>}
                    <div className="grid grid-cols-2 gap-3">
                      {templates.map(template => (
                        <button key={template.id} onClick={() => setSelectedTemplate(template)}
                          className={`flex flex-col items-center p-3 rounded-lg border transition-all text-left ${selectedTemplate.id === template.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}>
                          <div className="w-full aspect-video rounded mb-2 shadow-sm" style={{ backgroundColor: template.thumbnailColor }} />
                          <span className="text-xs font-bold text-slate-800 w-full text-center">{template.name}</span>
                          <span className="text-[9px] font-semibold text-slate-400 w-full text-center">{template.category}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Preview Panel */}
        <div className="flex-1 bg-slate-200/50 p-4 overflow-y-auto flex justify-center">
          <div className="bg-white shadow-xl shadow-slate-200/50 rounded" style={{ width: '794px', minHeight: '1123px' }}>
             <iframe srcDoc={previewHtml} className="w-full h-full border-0 pointer-events-none rounded" style={{ minHeight: '1123px' }} title="Preview" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassicTemplateDesigner;
