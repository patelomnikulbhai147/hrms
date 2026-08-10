import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Lock, History, Settings, GlobeLock, Smartphone } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const SecurityCenter = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [policy, setPolicy] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) {
      fetchSecurityData();
    }
  }, [activeCompanyId]);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const [pol, audit] = await Promise.all([
        api.get(`/api/security/policy?companyId=${activeCompanyId}`),
        api.get(`/api/security/audit-logs?companyId=${activeCompanyId}`)
      ]);
      setPolicy(pol);
      setLogs(audit);
    } catch (err) {
      toast.error('Failed to load security settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle2FA = async () => {
    try {
      const updated = await api.put('/api/security/policy', {
        companyId: activeCompanyId,
        require2FA: !policy.require2FA,
        ssoProvider: policy.ssoProvider,
        ipWhitelist: policy.ipWhitelist
      });
      setPolicy(updated);
      toast.success(updated.require2FA ? '2FA Enforced globally' : '2FA requirement disabled');
      fetchSecurityData(); // refresh logs
    } catch (err) {
      toast.error('Failed to update policy');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="text-brand-500" /> Security Center
          </h2>
          <p className="text-sm text-slate-500">Manage 2FA, SSO, IP whitelists, and audit logs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Policy Controls */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2 text-slate-700 font-bold">
              <Lock size={18} className="text-rose-500" /> Authentication Policies
            </div>
            <div className="p-6 space-y-6">
              
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">Enforce Two-Factor Authentication (2FA)</h4>
                    <p className="text-sm text-slate-500 mt-1">Require all employees to use an Authenticator App to log in.</p>
                  </div>
                </div>
                <button 
                  onClick={handleToggle2FA}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${policy?.require2FA ? 'bg-brand-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${policy?.require2FA ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="border-t border-slate-100 pt-6 flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                    <GlobeLock size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">Single Sign-On (SSO)</h4>
                    <p className="text-sm text-slate-500 mt-1">Allow login via Google Workspace, Azure AD, or Okta.</p>
                  </div>
                </div>
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition">
                  Configure SSO
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2 text-slate-700 font-bold">
              <ShieldAlert size={18} className="text-amber-500" /> Network Restrictions
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">IP Whitelist (CIDR blocks)</label>
              <textarea 
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                rows={3}
                placeholder="e.g. 192.168.1.1/24"
                defaultValue={policy?.ipWhitelist || ''}
              />
              <button className="mt-3 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                Save Restrictions
              </button>
            </div>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <History size={18} className="text-brand-500" /> Audit Log
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="text-center text-slate-500 text-sm">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center text-slate-500 text-sm">No recent activity.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="text-sm border-l-2 border-brand-200 pl-3">
                  <p className="font-bold text-slate-700">{log.action}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{new Date(log.createdAt).toLocaleString()}</p>
                  {log.metadata && (
                    <pre className="text-[10px] bg-slate-50 p-2 rounded mt-2 text-slate-600 overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
