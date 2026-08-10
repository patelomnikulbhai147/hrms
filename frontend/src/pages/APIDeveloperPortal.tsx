import React, { useState, useEffect } from 'react';
import { Terminal, Key, Webhook, FileCode2, Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const APIDeveloperPortal = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [keys, setKeys] = useState<any[]>([]);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (activeCompanyId) fetchKeys();
  }, [activeCompanyId]);

  const fetchKeys = async () => {
    try {
      const data = await api.get(`/api/developer/keys?companyId=${activeCompanyId}`);
      setKeys(data);
    } catch (err) {
      toast.error('Failed to load API keys');
    }
  };

  const handleGenerateKey = async () => {
    const appName = prompt('Enter Application Name (e.g. Internal Analytics):');
    if (!appName) return;
    try {
      await api.post('/api/developer/keys', { companyId: activeCompanyId, appName });
      toast.success('API Key generated securely');
      fetchKeys();
    } catch (err) {
      toast.error('Failed to generate key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Terminal className="text-brand-500" /> API & Developer Portal
          </h2>
          <p className="text-sm text-slate-500">Manage API keys, Webhooks, and OAuth applications.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition">
            <FileCode2 size={18} /> API Docs
          </button>
          <button 
            onClick={handleGenerateKey}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
          >
            <Plus size={18} /> Generate Key
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2 text-slate-700 font-bold">
          <Key size={18} className="text-amber-500" /> Active API Keys
        </div>
        
        {keys.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No API keys generated yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-slate-50 transition">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 mb-1">{k.appName}</h3>
                  <div className="flex flex-col gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-16 uppercase">API Key</span>
                      <code className="bg-slate-100 text-slate-700 px-3 py-1 rounded text-sm font-mono flex-1 truncate">{k.apiKey}</code>
                      <button onClick={() => copyToClipboard(k.apiKey)} className="p-1.5 text-slate-400 hover:text-brand-500 transition"><Copy size={14}/></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-16 uppercase">Secret</span>
                      <code className="bg-slate-100 text-slate-700 px-3 py-1 rounded text-sm font-mono flex-1 truncate">
                        {showSecret[k.id] ? k.apiSecret : '••••••••••••••••••••••••••••••••'}
                      </code>
                      <button onClick={() => setShowSecret(prev => ({...prev, [k.id]: !prev[k.id]}))} className="p-1.5 text-slate-400 hover:text-brand-500 transition">
                        {showSecret[k.id] ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                      <button onClick={() => copyToClipboard(k.apiSecret)} className="p-1.5 text-slate-400 hover:text-brand-500 transition"><Copy size={14}/></button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 border-l border-slate-200 pl-6 w-full md:w-auto">
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">Limit: {k.rateLimit}/hr</span>
                  <button className="text-rose-500 hover:text-rose-600 flex items-center gap-1 text-sm font-medium transition mt-4">
                    <Trash2 size={16} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <Webhook size={18} className="text-emerald-500" /> Webhook Subscriptions
          </div>
          <button className="text-sm font-medium text-brand-600 hover:text-brand-700">Add Endpoint</button>
        </div>
        <div className="p-8 text-center text-slate-500">
          No webhooks configured. 
        </div>
      </div>
    </div>
  );
};
