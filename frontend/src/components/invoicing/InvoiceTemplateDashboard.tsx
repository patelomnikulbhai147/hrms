import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/apiClient';
import CanvasInvoiceDesigner from './CanvasInvoiceDesigner';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { TemplateMiniPreview } from './TemplateMiniPreview';
import { GALLERY_TEMPLATES, GalleryTemplate } from './templateDefinitions';
import { generateTemplateElements } from './canvasTemplates';
import { 
  Plus, Copy as DocumentDuplicateIcon, CheckCircle2 as CheckCircleIcon, 
  Trash2 as TrashIcon, Edit as PencilIcon, Eye, Upload, LayoutTemplate, MonitorSmartphone
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface InvoiceTemplate {
  id: number;
  companyId: number;
  branchId?: number;
  name: string;
  type: string;
  status: string;
  designType: string;
  content: string;
  description?: string;
  version: number;
  _count?: { usageLogs: number; };
  createdAt: string;
  updatedAt: string;
}

export const InvoiceTemplateDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'my_templates'>('gallery');
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingTemplate, setEditingTemplate] = useState<Partial<InvoiceTemplate> | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  
  const [previewTemplate, setPreviewTemplate] = useState<GalleryTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTemplate, setActiveTemplate] = useState<any>(null);

  const fetchActiveTemplate = async () => {
    try {
      const active = await api.invoiceTemplates.active();
      setActiveTemplate(active);
    } catch (e) {}
  };

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const [data] = await Promise.all([
        api.invoiceTemplates.list(),
        fetchActiveTemplate()
      ]);
      setTemplates(data);
    } catch (e) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const isDefaultActive = !activeTemplate || activeTemplate.isDefault || activeTemplate.id === null;

  const handleActivate = async (id: number) => {
    try {
      const confirmActivation = window.confirm("Do you want to set this template as Active? It will be used for all future invoices.");
      if (!confirmActivation) return;

      await api.invoiceTemplates.activate(id);
      toast.success('Template activated');
      window.dispatchEvent(new Event('hrms:invoice-templates-changed'));
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to activate template');
    }
  };

  const handleActivateDefault = async () => {
    try {
      await api.invoiceTemplates.activateDefault();
      toast.success('Default Template activated successfully');
      window.dispatchEvent(new Event('hrms:invoice-templates-changed'));
      setIsPreviewOpen(false);
      setPreviewTemplate(null);
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to activate Default Template');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await api.invoiceTemplates.duplicate(id);
      toast.success('Template duplicated');
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to duplicate template');
    }
  };

  const handleDelete = async (id: number, status: string) => {
    if (status === 'Active') return toast.error('Cannot delete an active template');
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.invoiceTemplates.remove(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to delete template');
    }
  };

  const handleOpenBuilder = (template?: Partial<InvoiceTemplate>) => {
    if (template && !template.id && template.content && template.content.startsWith('<')) {
       // if we somehow get old HTML uploaded, wrap it in a text block
       template.content = JSON.stringify({ elements: [{ id: 'html-import', type: 'text', content: template.content, x: 0, y: 0, w: 794, h: 1123, visible: true, locked: false, zIndex: 1 }] });
    }
    setEditingTemplate(template || null);
    setIsBuilderOpen(true);
  };

  const handleCloseBuilder = () => {
    setIsBuilderOpen(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/html' && !file.name.endsWith('.html')) {
      toast.error('Please upload a valid HTML file. PDFs must be converted to HTML first.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const htmlContent = event.target?.result as string;
      handleOpenBuilder({ name: file.name.replace('.html', ''), content: htmlContent });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleUseGalleryTemplate = async (templateOverride?: any) => {
    const isTemplateObj = templateOverride && typeof templateOverride === 'object' && ('id' in templateOverride || 'content' in templateOverride);
    const tmpl = isTemplateObj ? templateOverride : previewTemplate;
    if (!tmpl) return;
    
    if (tmpl.id === 'system-default' || tmpl.content === '__SYSTEM_DEFAULT__') {
      await handleActivateDefault();
      return;
    }

    try {
      toast.loading('Applying template...', { id: 'apply' });
      // Create it
      const res = await api.invoiceTemplates.create({
        name: tmpl.name,
        description: 'Copied from Gallery',
        content: tmpl.content,
        status: 'Active', // Instantly activate
        designType: 'CANVAS'
      });
      toast.success('Template applied successfully', { id: 'apply' });
      window.dispatchEvent(new Event('hrms:invoice-templates-changed'));
      setIsPreviewOpen(false);
      setPreviewTemplate(null);
      setActiveTab('my_templates');
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to apply template', { id: 'apply' });
    }
  };

  const handleCustomizeGalleryTemplate = () => {
    if (!previewTemplate) return;
    setIsPreviewOpen(false);

    // Look for an existing saved template with the same name or ID
    const existing = templates.find((t) => t.name === previewTemplate.name || String(t.id) === String(previewTemplate.id));

    handleOpenBuilder({
      id: existing ? existing.id : (typeof previewTemplate.id === 'number' ? previewTemplate.id : undefined),
      name: previewTemplate.name,
      description: previewTemplate.description || 'Customized template',
      content: previewTemplate.content === '__SYSTEM_DEFAULT__' ? '' : previewTemplate.content
    });
    setPreviewTemplate(null);
  };

  if (isBuilderOpen) {
    let parsedElements: any[] = [];
    let parsedStyleRoles: any = undefined;

    if (!editingTemplate?.content || editingTemplate.content === '__SYSTEM_DEFAULT__' || editingTemplate.id === 'system-default') {
      parsedElements = generateTemplateElements('standard', {
        bg: '#ffffff',
        primary: '#1e293b',
        secondary: '#475569',
        text: '#1e293b',
        tableHeaderBg: '#f8fafc'
      });
    } else {
      try {
        const raw = typeof editingTemplate.content === 'string' ? JSON.parse(editingTemplate.content) : editingTemplate.content;
        if (Array.isArray(raw)) {
          parsedElements = raw;
        } else if (raw && typeof raw === 'object') {
          parsedElements = raw.elements || raw.blocks || [];
          parsedStyleRoles = raw.styleRoles;
        }
      } catch (e) {
        console.error('[InvoiceTemplateDashboard] Parse error:', e);
      }
    }
    
    const seedLayout = { 
       templateId: typeof editingTemplate?.id === 'number' ? editingTemplate.id : undefined, 
       name: editingTemplate?.name || 'Invoice Template',
       elements: parsedElements,
       styleRoles: parsedStyleRoles
    };

    return (
      <div className="fixed inset-0 z-50 bg-white">
        <CanvasInvoiceDesigner 
          company={{}} 
          canManage={true} 
          seedLayout={seedLayout} 
          isGalleryMode={true}
          onSaveLayout={async (layoutData) => {
            const templateName = layoutData.name || editingTemplate?.name || 'Untitled Template';
            const payload = {
              name: templateName,
              content: JSON.stringify({
                elements: layoutData.layout.blocks || layoutData.layout.elements || [],
                styleRoles: layoutData.layout.styleRoles
              }),
              designType: 'CANVAS',
              status: layoutData.status || 'Active'
            };
            if (editingTemplate?.id && typeof editingTemplate.id === 'number') {
               await api.invoiceTemplates.update(editingTemplate.id, payload);
               toast.success(`Updated "${templateName}"`);
            } else {
               await api.invoiceTemplates.create(payload);
               toast.success(`Saved "${templateName}"`);
            }
            window.dispatchEvent(new Event('hrms:invoice-templates-changed'));
            handleCloseBuilder();
            fetchTemplates();
          }}
          onCancel={handleCloseBuilder} 
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Manage designs for your generated invoices</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            accept=".html" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
          >
            <Upload className="w-4 h-4" /> Upload Template
          </button>
          <button 
            onClick={() => handleOpenBuilder()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" /> Build Your Own
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setActiveTab('gallery')}
            className={`px-6 py-4 font-medium text-sm transition-colors flex items-center gap-2 \${activeTab === 'gallery' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutTemplate className="w-4 h-4" /> Template Gallery
          </button>
          <button 
            onClick={() => setActiveTab('my_templates')}
            className={`px-6 py-4 font-medium text-sm transition-colors flex items-center gap-2 \${activeTab === 'my_templates' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <MonitorSmartphone className="w-4 h-4" /> My Templates
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'gallery' && (
            <div>
              <p className="text-gray-500 mb-6">Choose from our professionally designed templates. You can use them instantly or customize colors and layouts.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {GALLERY_TEMPLATES.map((tmpl) => {
                  const isActive = tmpl.id === 'system-default' ? isDefaultActive : (activeTemplate?.id && String(activeTemplate.id) === String(tmpl.id));
                  return (
                    <div key={tmpl.id} className={`border rounded-xl overflow-hidden hover:shadow-lg transition-shadow bg-white flex flex-col group relative ${isActive ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                      {tmpl.id === 'system-default' && (
                        <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white shadow-sm">
                          ★ DEFAULT
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white shadow-sm">
                          ACTIVE
                        </span>
                      )}
                      <div className="h-64 bg-gray-100 flex items-center justify-center border-b border-gray-200 relative overflow-hidden group-hover:bg-indigo-50 transition-colors">
                        <div className="absolute inset-0 pointer-events-none">
                          <TemplateMiniPreview content={tmpl.content} />
                        </div>
                        
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                          <button 
                            onClick={() => { setPreviewTemplate(tmpl); setIsPreviewOpen(true); }}
                            className="px-4 py-2 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors w-32 flex justify-center items-center gap-2 text-xs"
                          >
                            <Eye className="w-4 h-4" /> Preview
                          </button>
                          <button 
                            onClick={() => { handleUseGalleryTemplate(tmpl); }}
                            disabled={isActive}
                            className={`px-4 py-2 text-white font-medium rounded-lg transition-colors w-32 flex justify-center items-center gap-2 text-xs ${isActive ? 'bg-emerald-600 cursor-default' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                          >
                            <CheckCircleIcon className="w-4 h-4" /> {isActive ? 'Active' : 'Use'}
                          </button>
                        </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h3 className="font-bold text-gray-900 text-sm">{tmpl.name}</h3>
                          {tmpl.category && <span className="text-[9px] font-bold uppercase text-slate-400">{tmpl.category}</span>}
                        </div>
                        <p className="text-xs text-gray-500 flex-1">{tmpl.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'my_templates' && (
            <div>
              {loading ? (
                <div className="py-20 text-center text-gray-500 animate-pulse">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="py-20 text-center">
                  <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No Custom Templates</h3>
                  <p className="text-gray-500 mt-1 max-w-md mx-auto">You haven't saved any templates yet. Select one from the Gallery or build your own.</p>
                  <button 
                    onClick={() => setActiveTab('gallery')}
                    className="mt-6 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Browse Gallery
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {templates.map(t => (
                    <div key={t.id} className={`border rounded-xl overflow-hidden bg-white flex flex-col transition-all group \${t.status === 'Active' ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                      
                      <div className="h-64 bg-gray-100 flex items-center justify-center border-b border-gray-200 relative overflow-hidden group-hover:bg-indigo-50 transition-colors">
                        <div className="absolute inset-0 pointer-events-none">
                          <TemplateMiniPreview content={t.content} />
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                          <button 
                            onClick={() => { setPreviewTemplate(t as any); setIsPreviewOpen(true); }}
                            className="px-4 py-2 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors w-32 flex justify-center items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Preview
                          </button>
                          {t.status !== 'Active' && (
                            <button 
                              onClick={() => handleActivate(t.id)}
                              className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors w-32 flex justify-center items-center gap-2"
                            >
                              <CheckCircleIcon className="w-4 h-4" /> Activate
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-5 flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-gray-900 text-lg truncate pr-2">{t.name}</h3>
                          {t.status === 'Active' && (
                            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
                              <CheckCircleIcon className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[40px]">{t.description || 'No description provided.'}</p>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">v{t.version}</span>
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">{t.designType}</span>
                          {t._count && <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">{t._count.usageLogs} Invoices</span>}
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 border-t border-gray-100 p-3 grid grid-cols-4 gap-2">
                        <button 
                          onClick={() => handleOpenBuilder(t)}
                          className="flex flex-col items-center justify-center p-2 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                          title="Edit Template"
                        >
                          <PencilIcon className="w-4 h-4 mb-1" />
                          <span className="text-[10px] font-medium">Edit</span>
                        </button>
                        <button 
                          onClick={() => handleDuplicate(t.id)}
                          className="flex flex-col items-center justify-center p-2 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                          title="Duplicate"
                        >
                          <DocumentDuplicateIcon className="w-4 h-4 mb-1" />
                          <span className="text-[10px] font-medium">Copy</span>
                        </button>
                        {t.status !== 'Active' ? (
                          <button 
                            onClick={() => handleActivate(t.id)}
                            className="flex flex-col items-center justify-center p-2 rounded hover:bg-indigo-100 text-indigo-600 transition-colors"
                            title="Set Active"
                          >
                            <CheckCircleIcon className="w-4 h-4 mb-1" />
                            <span className="text-[10px] font-medium">Activate</span>
                          </button>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 opacity-50 cursor-not-allowed">
                            <CheckCircleIcon className="w-4 h-4 mb-1 text-gray-400" />
                            <span className="text-[10px] font-medium text-gray-400">Active</span>
                          </div>
                        )}
                        <button 
                          onClick={() => handleDelete(t.id, t.status)}
                          disabled={t.status === 'Active'}
                          className={`flex flex-col items-center justify-center p-2 rounded transition-colors \${t.status === 'Active' ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-red-50 text-red-600'}`}
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4 mb-1" />
                          <span className="text-[10px] font-medium">Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TemplatePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        templateName={previewTemplate?.name || ''}
        templateContent={previewTemplate?.content || ''}
        onUseTemplate={handleUseGalleryTemplate}
        onCustomize={handleCustomizeGalleryTemplate}
      />
    </div>
  );
};
