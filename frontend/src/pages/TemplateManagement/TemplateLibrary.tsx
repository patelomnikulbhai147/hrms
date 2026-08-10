import React, { useState, useEffect } from 'react';
import { Plus, Edit2, FileText, Trash2, Eye } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';
import { ModuleLayout } from '@/components/layout/ModuleLayout';

interface Template {
  id: number;
  name: string;
  type: string;
  status: string;
  version: number;
  _count?: { usageLogs: number };
}

import { AssignTemplateModal } from './components/AssignTemplateModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { TemplateAnalytics } from './components/TemplateAnalytics';
import { TemplateBuilder } from './TemplateBuilder';

export const TemplateLibrary = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [marketplaceTemplates, setMarketplaceTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'library' | 'marketplace' | 'analytics'>('library');
  const [activeView, setActiveView] = useState<'main' | 'builder'>('main');
  const [editingTemplateId, setEditingTemplateId] = useState<number | undefined>();
  
  // Modals
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{id: number, name: string} | null>(null);

  // In a real app, this would use the active company context
  const activeCompanyId = localStorage.getItem('hrms_active_company_id');

  useEffect(() => {
    fetchTemplates();
    fetchMarketplaceTemplates();
  }, [activeCompanyId]);

  const fetchTemplates = async () => {
    if (!activeCompanyId) return;
    try {
      const res = await fetch(`/api/templates?companyId=${activeCompanyId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      if (res.success) setTemplates(res.templates);
    } catch (error) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketplaceTemplates = async () => {
    try {
      const res = await fetch(`/api/templates/marketplace`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      if (res.success) setMarketplaceTemplates(res.templates);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDuplicate = async (templateId: number) => {
    try {
      const res = await fetch(`/api/templates/${templateId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`
        },
        body: JSON.stringify({ targetCompanyId: activeCompanyId })
      }).then(r => r.json());
      
      if (res.success) {
        toast.success('Template added to your workspace');
        setActiveTab('library');
        fetchTemplates();
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch (err) {
      toast.error('Error duplicating template');
    }
  };

  if (activeView === 'builder') {
    return (
      <TemplateBuilder 
        templateId={editingTemplateId} 
        onBack={() => {
          setActiveView('main');
          setEditingTemplateId(undefined);
          fetchTemplates();
        }} 
      />
    );
  }

  return (
    <>
    <ModuleLayout
      title="Template Management"
      subtitle="Manage document templates for invoices, payslips, offer letters, and more."
      actions={
        <button
          onClick={() => {
            setEditingTemplateId(undefined);
            setActiveView('builder');
          }}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition flex items-center gap-2 font-medium shadow-sm"
        >
          <Plus size={18} />
          Create Template
        </button>
      }
    >
      <div className="mb-6 border-b border-slate-200 flex gap-6">
        <button 
          onClick={() => setActiveTab('library')}
          className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${activeTab === 'library' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          My Templates
        </button>
        <button 
          onClick={() => setActiveTab('marketplace')}
          className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${activeTab === 'marketplace' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Marketplace
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Analytics
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No templates found</h3>
          <p className="text-slate-500 mb-6">You haven't created any document templates yet.</p>
          <button 
            onClick={() => {
              setEditingTemplateId(undefined);
              setActiveView('builder');
            }}
            className="text-brand-600 font-medium hover:text-brand-700"
          >
            Create your first template →
          </button>
        </div>
      ) : activeTab === 'library' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Template Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Version</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Generated</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {templates.map(template => (
                <tr key={template.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="bg-brand-50 p-2 rounded-lg mr-3">
                        <FileText className="w-5 h-5 text-brand-600" />
                      </div>
                      <div className="text-sm font-medium text-slate-900">{template.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      {template.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      template.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      template.status === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {template.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    v{template.version}.0
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">
                    {template._count?.usageLogs || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setSelectedTemplate({ id: template.id, name: template.name });
                          setAssignModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-brand-600 transition-colors px-2 py-1 bg-slate-50 hover:bg-brand-50 rounded text-xs border border-slate-200"
                      >
                        Assign
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedTemplate({ id: template.id, name: template.name });
                          setVersionModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-brand-600 transition-colors px-2 py-1 bg-slate-50 hover:bg-brand-50 rounded text-xs border border-slate-200"
                      >
                        Versions
                      </button>
                      <div className="w-px h-6 bg-slate-200 mx-1"></div>
                      <button 
                        onClick={() => {
                          setEditingTemplateId(template.id);
                          setActiveView('builder');
                        }}
                        className="text-slate-400 hover:text-brand-600 transition-colors p-1" 
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'marketplace' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {marketplaceTemplates.map(template => (
            <div key={template.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-brand-50 p-3 rounded-xl">
                  <FileText className="w-6 h-6 text-brand-600" />
                </div>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">{template.type}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{template.name}</h3>
              <p className="text-sm text-slate-500 mb-6 h-10 line-clamp-2">Standard template configured by Zenia Platform Admins.</p>
              <button 
                onClick={() => handleDuplicate(template.id)}
                className="w-full py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition shadow-sm"
              >
                Add to My Workspace
              </button>
            </div>
          ))}
          {marketplaceTemplates.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">No marketplace templates available.</div>
          )}
        </div>
      ) : (
        <TemplateAnalytics />
      )}
    </ModuleLayout>

    {assignModalOpen && selectedTemplate && (
      <AssignTemplateModal 
        templateId={selectedTemplate.id} 
        templateName={selectedTemplate.name} 
        onClose={() => setAssignModalOpen(false)} 
      />
    )}

    {versionModalOpen && selectedTemplate && (
      <VersionHistoryModal 
        templateId={selectedTemplate.id} 
        templateName={selectedTemplate.name} 
        onClose={() => {
          setVersionModalOpen(false);
          fetchTemplates();
        }} 
      />
    )}
    </>
  );
};
