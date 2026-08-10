import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Clock, ArrowRightLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TemplateComparisonModal } from './TemplateComparisonModal';

interface VersionHistoryModalProps {
  templateId: number;
  templateName: string;
  onClose: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({ templateId, templateName, onClose }) => {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [compareData, setCompareData] = useState<{
    isOpen: boolean;
    oldContent: string;
    newContent: string;
    oldVersion: number;
    newVersion: number;
  }>({ isOpen: false, oldContent: '', newContent: '', oldVersion: 0, newVersion: 0 });

  useEffect(() => {
    fetchVersions();
  }, []);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      
      if (res.success && res.template) {
        setVersions(res.template.versions || []);
      }
    } catch (err) {
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: number) => {
    if (!window.confirm('Are you sure you want to restore this version? This will become the new current draft.')) return;
    
    setRestoring(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/restore/${versionId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());

      if (res.success) {
        toast.success('Version restored successfully!');
        onClose();
      } else {
        toast.error('Failed to restore version');
      }
    } catch (err) {
      toast.error('Error restoring version');
    } finally {
      setRestoring(false);
    }
  };

  const handleCompare = (oldVer: any) => {
    // Current draft/version is index 0 in the list (or we can just fetch the active template)
    const currentVer = versions[0];
    if (!currentVer) return;

    setCompareData({
      isOpen: true,
      oldContent: oldVer.content || '',
      newContent: currentVer.content || '',
      oldVersion: oldVer.version,
      newVersion: currentVer.version
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Version History</h3>
            <p className="text-sm text-slate-500">{templateName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-2 bg-slate-100 rounded-full">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center text-slate-500 py-10">No version history found.</div>
          ) : (
            <div className="space-y-4">
              {versions.map((v, i) => (
                <div key={v.id} className="bg-white border border-slate-200 p-4 rounded-lg flex items-center justify-between shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-50 text-brand-600 p-2 rounded-lg mt-1">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Version {v.version} {i === 0 && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">Current</span>}</h4>
                      <p className="text-sm text-slate-500 mt-1">{v.changeSummary || 'Template updated'}</p>
                      <p className="text-xs text-slate-400 mt-2">{new Date(v.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {i !== 0 && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleCompare(v)}
                        className="text-sm font-medium text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded transition flex items-center gap-1.5 border border-slate-200 bg-white"
                      >
                        <ArrowRightLeft size={16} /> Compare
                      </button>
                      <button 
                        onClick={() => handleRestore(v.id)}
                        disabled={restoring}
                        className="text-sm font-medium text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded transition flex items-center gap-1.5 disabled:opacity-50 border border-brand-200 bg-white"
                      >
                        <RotateCcw size={16} /> Restore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <TemplateComparisonModal 
        isOpen={compareData.isOpen}
        onClose={() => setCompareData(prev => ({ ...prev, isOpen: false }))}
        oldVersionContent={compareData.oldContent}
        newVersionContent={compareData.newContent}
        oldVersionNumber={compareData.oldVersion}
        newVersionNumber={compareData.newVersion}
      />
    </div>
  );
};
