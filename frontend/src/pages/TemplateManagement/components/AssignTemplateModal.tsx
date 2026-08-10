import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AssignTemplateModalProps {
  templateId: number;
  templateName: string;
  onClose: () => void;
}

export const AssignTemplateModal: React.FC<AssignTemplateModalProps> = ({ templateId, templateName, onClose }) => {
  const [targetType, setTargetType] = useState('Company');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const activeCompanyId = localStorage.getItem('hrms_active_company_id');
      const payload = {
        companyId: activeCompanyId,
        targetType,
        targetId: targetId ? Number(targetId) : null
      };

      const res = await fetch(`/api/templates/${templateId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`
        },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (res.success) {
        toast.success('Template assigned successfully');
        onClose();
      } else {
        toast.error(res.message || 'Failed to assign template');
      }
    } catch (err) {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Assign Template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Template</label>
            <div className="p-2 bg-slate-50 border border-slate-200 rounded font-medium text-slate-800">
              {templateName}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign To (Target Type)</label>
            <select 
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="Company">Global (Entire Company)</option>
              <option value="Branch">Specific Branch</option>
              <option value="Department">Specific Department</option>
              <option value="Client">Specific Client</option>
              <option value="Project">Specific Project</option>
            </select>
          </div>

          {targetType !== 'Company' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target ID</label>
              <input 
                type="number"
                placeholder={`Enter ${targetType} ID`}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter the exact ID of the {targetType.toLowerCase()}. E.g., for Client A, enter their Client ID.
              </p>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving || (targetType !== 'Company' && !targetId)}
            className="px-4 py-2 bg-brand-600 text-white font-medium hover:bg-brand-700 rounded-lg flex items-center gap-2 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : <><Check size={18} /> Confirm Assignment</>}
          </button>
        </div>
      </div>
    </div>
  );
};
