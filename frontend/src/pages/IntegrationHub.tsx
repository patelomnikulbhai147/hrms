import React, { useState, useEffect } from 'react';
import { Blocks, Link2, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const IntegrationHub = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const availableIntegrations = [
    { id: 'google_workspace', name: 'Google Workspace', icon: 'G', color: 'text-blue-500 bg-blue-50 border-blue-200' },
    { id: 'slack', name: 'Slack', icon: '#', color: 'text-purple-500 bg-purple-50 border-purple-200' },
    { id: 'sap', name: 'SAP ERP', icon: 'S', color: 'text-blue-700 bg-blue-50 border-blue-300' },
    { id: 'tally', name: 'Tally Prime', icon: 'T', color: 'text-amber-500 bg-amber-50 border-amber-200' },
  ];

  useEffect(() => {
    if (activeCompanyId) fetchIntegrations();
  }, [activeCompanyId]);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/integrations?companyId=${activeCompanyId}`);
      setIntegrations(data);
    } catch (err) {
      toast.error('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (providerId: string) => {
    try {
      await api.post('/api/integrations/connect', { companyId: activeCompanyId, provider: providerId });
      toast.success(`Connected to ${providerId}`);
      fetchIntegrations();
    } catch (err) {
      toast.error('Connection failed');
    }
  };

  const isConnected = (id: string) => integrations.some(i => i.provider === id && i.status === 'Connected');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Blocks className="text-brand-500" /> Integration Hub
          </h2>
          <p className="text-sm text-slate-500">Connect your HRMS with third-party tools via OAuth & Webhooks.</p>
        </div>
        <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition">
          <Key size={18} /> Manage API Keys
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {availableIntegrations.map(app => {
          const connected = isConnected(app.id);
          return (
            <div key={app.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-6">
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-xl font-black ${app.color}`}>
                  {app.icon}
                </div>
                {connected ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    <CheckCircle2 size={14} /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                    <AlertCircle size={14} /> Not Connected
                  </span>
                )}
              </div>
              
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{app.name}</h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">Enable automated syncing between HRMS and {app.name}.</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                {connected ? (
                  <button className="flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 py-2 rounded-lg text-sm font-medium transition">
                    Disconnect
                  </button>
                ) : (
                  <button 
                    onClick={() => handleConnect(app.id)}
                    className="flex-1 bg-brand-50 text-brand-700 hover:bg-brand-100 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <Link2 size={16} /> Connect Account
                  </button>
                )}
                <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition">
                  Settings
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
