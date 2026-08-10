import React, { useState, useEffect } from 'react';
import {
  GitMerge, Plus, Play, Settings2, Trash2, Zap, Loader2, AlertCircle,
  RefreshCw, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Save, X
} from 'lucide-react';
import { api } from '@/api/apiClient';

interface WFProps {
  activeCompanyId: string | null;
  role: string;
}

const TRIGGER_EVENTS = [
  'OnEmployeeOnboard', 'OnEmployeeResignation', 'OnLeaveRequest', 'OnLeaveApproval',
  'OnLeaveRejection', 'OnPayrollProcessed', 'OnAttendanceLate', 'OnAttendanceAbsent',
  'OnDocumentExpiry', 'OnAssetAllocation', 'OnRecruitmentApplication',
];

const ACTION_TYPES = ['Email', 'Notification', 'Task', 'Webhook', 'SlackMessage', 'WhatsApp'];

export const WorkflowEngine = ({ activeCompanyId, role }: WFProps) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Create form state
  const [form, setForm] = useState({
    name: '',
    triggerEvent: TRIGGER_EVENTS[0],
    condition: '',
    actions: [{ type: 'Email', config: { subject: '', to: '', body: '' } }],
  });

  const fetchWorkflows = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.get(`/api/workflows`, {
        params: { companyId: activeCompanyId },
      });
      const payload = res.data;
      setWorkflows(Array.isArray(payload) ? payload : payload?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await api.post('/api/workflows', {
        companyId: activeCompanyId,
        name: form.name,
        triggerEvent: form.triggerEvent,
        condition: form.condition,
        actions: form.actions,
      });
      setCreating(false);
      setForm({ name: '', triggerEvent: TRIGGER_EVENTS[0], condition: '', actions: [{ type: 'Email', config: { subject: '', to: '', body: '' } }] });
      fetchWorkflows();
    } catch (err: any) {
      alert(err?.message || 'Failed to create workflow');
    }
  };

  const handleToggle = async (wf: any) => {
    try {
      await api.put(`/api/workflows/${wf.id}`, {
        ...wf,
        status: wf.status === 'Active' ? 'Inactive' : 'Active',
      });
      fetchWorkflows();
    } catch (err) {
      alert('Failed to update workflow status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this workflow? This action cannot be undone.')) return;
    try {
      await api.delete(`/api/workflows/${id}`);
      fetchWorkflows();
    } catch (err) {
      alert('Failed to delete workflow');
    }
  };

  const canEdit = role === 'Company Head' || role === 'Super Admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <GitMerge className="text-brand-500" /> Workflow Automation
          </h2>
          <p className="text-sm text-slate-500 mt-1">Automate HR processes with trigger-based rules and actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {canEdit && (
            <button
              onClick={() => setCreating(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition text-sm"
            >
              <Plus size={16} /> Create Workflow
            </button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {creating && (
        <div className="bg-white rounded-xl border border-brand-200 shadow-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Zap size={18} className="text-brand-500" /> New Workflow</h3>
            <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Workflow Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. New Hire Onboarding"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Trigger Event *</label>
              <select
                value={form.triggerEvent}
                onChange={e => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white"
              >
                {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Condition (optional)</label>
              <input
                type="text"
                value={form.condition}
                onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                placeholder="e.g. department = IT"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600">Actions</label>
              <button
                onClick={() => setForm(f => ({ ...f, actions: [...f.actions, { type: 'Email', config: { subject: '', to: '', body: '' } }] }))}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add Action
              </button>
            </div>
            {form.actions.map((action, i) => (
              <div key={i} className="flex gap-3 mb-2 items-start">
                <select
                  value={action.type}
                  onChange={e => {
                    const updated = [...form.actions];
                    updated[i] = { ...updated[i], type: e.target.value };
                    setForm(f => ({ ...f, actions: updated }));
                  }}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none"
                >
                  {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={action.config?.subject || ''}
                  onChange={e => {
                    const updated = [...form.actions];
                    updated[i] = { ...updated[i], config: { ...updated[i].config, subject: e.target.value } };
                    setForm(f => ({ ...f, actions: updated }));
                  }}
                  placeholder="Subject / Message / Webhook URL"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {form.actions.length > 1 && (
                  <button
                    onClick={() => setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))}
                    className="text-rose-400 hover:text-rose-600 p-2"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim()}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={14} /> Save Workflow
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-brand-500 mr-3" size={28} />
          <span className="text-slate-500">Loading workflows…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center">
          <AlertCircle className="text-rose-400 mx-auto mb-2" size={32} />
          <p className="text-rose-700 font-medium">{error}</p>
          <button onClick={fetchWorkflows} className="mt-3 text-sm text-brand-600 hover:underline">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && workflows.length === 0 && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <GitMerge size={40} className="text-slate-300 mx-auto mb-4" />
          <h3 className="font-bold text-slate-700 mb-2">No Workflows Yet</h3>
          <p className="text-sm text-slate-400 mb-6">Create your first automated workflow to streamline HR processes.</p>
          {canEdit && (
            <button
              onClick={() => setCreating(true)}
              className="bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 transition"
            >
              <Plus size={15} className="inline mr-1" /> Create First Workflow
            </button>
          )}
        </div>
      )}

      {/* Workflow Cards */}
      {!loading && !error && workflows.length > 0 && (
        <div className="space-y-4">
          {workflows.map((wf: any) => (
            <div key={wf.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div
                className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition"
                onClick={() => setExpanded(expanded === wf.id ? null : wf.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{wf.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Trigger: {wf.triggerEvent}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${wf.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {wf.status}
                  </span>
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); handleToggle(wf); }}
                      className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500"
                      title={wf.status === 'Active' ? 'Disable' : 'Enable'}
                    >
                      {wf.status === 'Active' ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(wf.id); }}
                      className="p-2 hover:bg-rose-50 rounded-lg transition text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {expanded === wf.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>

              {expanded === wf.id && (
                <div className="p-6 space-y-4">
                  {wf.condition && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
                      <span className="text-xs font-semibold text-amber-700">Condition: </span>
                      <span className="text-xs text-amber-600 font-mono">{wf.condition}</span>
                    </div>
                  )}
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Execution Steps</h4>
                  <div className="flex flex-col gap-3 relative">
                    <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-200" />
                    {wf.actions?.map((action: any, i: number) => (
                      <div key={action.id || i} className="flex items-center gap-4 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center hover:border-brand-300 transition">
                          <div>
                            <p className="text-sm font-bold text-slate-700">{action.type} Action</p>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-xs">
                              {typeof action.config === 'string' ? action.config : JSON.stringify(action.config)}
                            </p>
                          </div>
                          <Play size={14} className="text-slate-300 flex-shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                  {wf.lastRunAt && (
                    <p className="text-xs text-slate-400">Last executed: {new Date(wf.lastRunAt).toLocaleString('en-IN')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
