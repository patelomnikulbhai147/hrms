import React, { useState, useEffect } from 'react';
import { 
  Blocks, Link2, Key, CheckCircle2, AlertCircle, RefreshCw, Settings, 
  Trash2, ShieldCheck, Zap, Server, Copy, Eye, Clock, FileText, Check, X,
  Activity, ArrowRight, ExternalLink, Info
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

interface IntegrationHubProps {
  activeCompanyId?: number;
}

const DEFAULT_AVAILABLE_INTEGRATIONS = [
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    category: 'Productivity & Directory',
    description: 'Sync Google Calendar meetings, Drive documents, and Workspace user directory.',
    icon: 'G',
    authType: 'OAuth2',
    color: 'text-blue-500 bg-blue-50 border-blue-200',
    status: 'Not Configured'
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Broadcast real-time leave, attendance, payroll, and workflow notifications to Slack channels.',
    icon: '#',
    authType: 'OAuth2',
    color: 'text-purple-500 bg-purple-50 border-purple-200',
    status: 'Not Configured'
  },
  {
    id: 'sap',
    name: 'SAP ERP',
    category: 'Enterprise ERP',
    description: 'Bidirectional synchronization of employee records, financial ledgers, and invoice data with SAP.',
    icon: 'S',
    authType: 'API_Key_OData',
    color: 'text-blue-700 bg-blue-50 border-blue-300',
    status: 'Not Configured'
  },
  {
    id: 'tally',
    name: 'Tally Prime',
    category: 'Accounting & Payroll',
    description: 'Automated export of payroll vouchers, attendance records, and master data to Tally Prime.',
    icon: 'T',
    authType: 'XML_HTTP',
    color: 'text-amber-500 bg-amber-50 border-amber-200',
    status: 'Not Configured'
  }
];

export const IntegrationHub: React.FC<IntegrationHubProps> = ({ activeCompanyId }) => {
  const [integrations, setIntegrations] = useState<any[]>(DEFAULT_AVAILABLE_INTEGRATIONS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'hub' | 'api-keys' | 'logs'>('hub');

  // Selected Integration for Detail/Settings Modal
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [providerDetails, setProviderDetails] = useState<any | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Settings form state
  const [googleOauthForm, setGoogleOauthForm] = useState({ clientId: '', clientSecret: '', redirectUri: 'http://localhost:5000/api/integrations/google_workspace/oauth/callback' });
  const [slackOauthForm, setSlackOauthForm] = useState({ clientId: '', clientSecret: '', redirectUri: 'http://localhost:5000/api/integrations/slack/oauth/callback', defaultChannel: '#general' });
  const [sapForm, setSapForm] = useState({ baseUrl: '', client: '', username: '', password: '', apiKey: '', environment: 'Production' });
  const [tallyForm, setTallyForm] = useState({ host: 'http://localhost', port: 9000, companyName: '' });
  const [syncSettings, setSyncSettings] = useState({ syncEnabled: true, syncFrequency: 'Hourly', syncDirection: 'Bidirectional' });

  // API Keys state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({ name: '', scopes: ['read:employees', 'write:attendance'], rateLimit: 1000, expiresAt: '' });
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    fetchIntegrations();
    fetchApiKeys();
  }, [activeCompanyId]);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      const res = await api.get(`/api/integrations${query}`);
      const data = res?.data || res;
      if (Array.isArray(data)) {
        setIntegrations(data);
      } else {
        setIntegrations(DEFAULT_AVAILABLE_INTEGRATIONS);
      }
    } catch (err: any) {
      console.error('Failed to load integrations:', err);
      setIntegrations(DEFAULT_AVAILABLE_INTEGRATIONS);
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      const res = await api.get(`/api/integrations/api-keys${query}`);
      const data = res?.data || res;
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch API keys:', err);
    }
  };

  const openSettingsModal = async (provider: any) => {
    setSelectedProvider(provider);
    setTestResult(null);
    setIsSettingsOpen(true);

    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      const res = await api.get(`/api/integrations/${provider.id}${query}`);
      const details = res?.data || res;
      setProviderDetails(details);
      setSyncSettings({
        syncEnabled: details.syncEnabled ?? true,
        syncFrequency: details.syncFrequency || 'Hourly',
        syncDirection: details.syncDirection || 'Bidirectional'
      });

      if (provider.id === 'google_workspace' && details.settings) {
        setGoogleOauthForm({
          clientId: details.settings.clientId || '',
          clientSecret: '',
          redirectUri: details.settings.redirectUri || 'http://localhost:5000/api/integrations/google_workspace/oauth/callback'
        });
      } else if (provider.id === 'slack' && details.settings) {
        setSlackOauthForm({
          clientId: details.settings.clientId || '',
          clientSecret: '',
          redirectUri: details.settings.redirectUri || 'http://localhost:5000/api/integrations/slack/oauth/callback',
          defaultChannel: details.settings.defaultChannel || '#general'
        });
      } else if (provider.id === 'sap' && details.settings) {
        setSapForm({
          baseUrl: details.settings.baseUrl || '',
          client: details.settings.client || '',
          username: '',
          password: '',
          apiKey: '',
          environment: details.settings.environment || 'Production'
        });
      } else if (provider.id === 'tally' && details.settings) {
        setTallyForm({
          host: details.settings.host || 'http://localhost',
          port: details.settings.port || 9000,
          companyName: details.settings.companyName || ''
        });
      }
    } catch (err) {
      toast.error('Failed to fetch integration settings');
    }
  };

  const handleConnectOAuth = async (providerId: string) => {
    setConnectingProvider(providerId);
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      const res = await api.get(`/api/integrations/${providerId}/oauth/start${query}`);
      const authUrl = res?.data?.authUrl || res?.authUrl;

      if (authUrl) {
        window.open(authUrl, '_blank', 'width=600,height=700');
        toast.success(`Opening ${providerId === 'google_workspace' ? 'Google Workspace' : 'Slack'} authorization...`);
      } else {
        throw new Error('OAuth URL was not returned');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || `OAuth not configured for ${providerId}`;
      toast.error(errorMsg);
      // Open settings modal so user can configure Client ID & Secret
      const providerMeta = DEFAULT_AVAILABLE_INTEGRATIONS.find(p => p.id === providerId) || { id: providerId, name: providerId };
      openSettingsModal(providerMeta);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleSaveGoogleOauthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...googleOauthForm, companyId: activeCompanyId };
      const res = await api.post('/api/integrations/google_workspace/connect', payload);
      toast.success('Google Workspace OAuth configuration saved');
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save Google OAuth configuration');
    }
  };

  const handleSaveSlackOauthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...slackOauthForm, companyId: activeCompanyId };
      const res = await api.post('/api/integrations/slack/connect', payload);
      toast.success('Slack OAuth configuration saved');
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save Slack OAuth configuration');
    }
  };

  const handleSaveSapConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...sapForm, companyId: activeCompanyId };
      const res = await api.post('/api/integrations/sap/connect', payload);
      const resData = res?.data || res;
      toast.success('SAP ERP configuration saved successfully');
      if (resData.testResult) setTestResult(resData.testResult);
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save SAP configuration');
    }
  };

  const handleSaveTallyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...tallyForm, companyId: activeCompanyId };
      const res = await api.post('/api/integrations/tally/connect', payload);
      const resData = res?.data || res;
      toast.success('Tally Prime configuration saved successfully');
      if (resData.testResult) setTestResult(resData.testResult);
      fetchIntegrations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save Tally configuration');
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedProvider) return;
    try {
      const payload = { ...syncSettings, companyId: activeCompanyId };
      await api.put(`/api/integrations/${selectedProvider.id}/settings`, payload);
      toast.success('Integration settings updated');
      fetchIntegrations();
    } catch (err: any) {
      toast.error('Failed to update settings');
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      const res = await api.post(`/api/integrations/${providerId}/test${query}`, { companyId: activeCompanyId });
      const testData = res?.data || res;
      setTestResult(testData);
      if (testData.success) {
        toast.success(testData.message);
      } else {
        toast.error(testData.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Connection test failed';
      setTestResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTriggerSync = async (providerId: string) => {
    setSyncingProvider(providerId);
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      await api.post(`/api/integrations/${providerId}/sync${query}`, { companyId: activeCompanyId });
      toast.success(`Sync completed for ${providerId}`);
      fetchIntegrations();
      if (selectedProvider && selectedProvider.id === providerId) {
        openSettingsModal(selectedProvider);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Synchronization failed');
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm(`Are you sure you want to disconnect ${providerId}? Credentials will be cleared.`)) return;
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      await api.delete(`/api/integrations/${providerId}${query}`);
      toast.success(`Disconnected ${providerId}`);
      setIsSettingsOpen(false);
      fetchIntegrations();
    } catch (err: any) {
      toast.error('Failed to disconnect integration');
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingApiKey(true);
    try {
      const payload = { ...newKeyForm, companyId: activeCompanyId };
      const res = await api.post('/api/integrations/api-keys', payload);
      const data = res?.data || res;
      setCreatedRawKey(data.rawApiKey);
      setIsCreateKeyOpen(false);
      setNewKeyForm({ name: '', scopes: ['read:employees', 'write:attendance'], rateLimit: 1000, expiresAt: '' });
      fetchApiKeys();
      toast.success('API key generated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create API key');
    } finally {
      setCreatingApiKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: number) => {
    if (!confirm('Are you sure you want to revoke this API key? Applications using it will be denied access.')) return;
    try {
      const query = activeCompanyId ? `?companyId=${activeCompanyId}` : '';
      await api.delete(`/api/integrations/api-keys/${keyId}${query}`);
      toast.success('API key revoked');
      fetchApiKeys();
    } catch (err: any) {
      toast.error('Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success('Copied API Key to clipboard!');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Connected':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircle2 size={13} className="text-emerald-500" /> Connected
          </span>
        );
      case 'Syncing':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
            <RefreshCw size={13} className="animate-spin text-blue-500" /> Syncing...
          </span>
        );
      case 'Error':
      case 'Authentication Required':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
            <AlertCircle size={13} className="text-rose-500" /> Needs Attention
          </span>
        );
      case 'Not Configured':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <AlertCircle size={13} className="text-amber-500" /> Not Configured
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
            <AlertCircle size={13} className="text-slate-400" /> Disconnected
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600 border border-brand-100">
              <Blocks size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900">Integration Hub</h2>
                <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full tracking-wider border border-emerald-200">
                  Production Ready
                </span>
              </div>
              <p className="text-sm text-slate-500">
                Connect your HRMS with Google Workspace, Slack, SAP ERP, Tally Prime & custom API Keys with end-to-end encryption.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('hub')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 ${
              activeTab === 'hub' ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Blocks size={16} /> Integrations
          </button>

          <button
            onClick={() => { setActiveTab('api-keys'); fetchApiKeys(); }}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 ${
              activeTab === 'api-keys' ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Key size={16} /> API Keys
          </button>
        </div>
      </div>

      {/* RAW API KEY DISPLAY MODAL (ONCE UPON CREATION) */}
      {createdRawKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-emerald-600 mb-2">
              <CheckCircle2 size={24} />
              <h3 className="text-xl font-bold text-slate-900">API Key Created Successfully</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Please copy your API secret key now. <strong className="text-rose-600">This key will only be shown once!</strong>
            </p>

            <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-sm break-all flex items-center justify-between gap-3 border border-slate-800">
              <span>{createdRawKey}</span>
              <button
                onClick={() => copyToClipboard(createdRawKey)}
                className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-lg transition flex items-center gap-1 shrink-0 font-sans text-xs font-bold"
                title="Copy Key"
              >
                {copiedKey ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setCreatedRawKey(null)}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-5 py-2.5 rounded-xl transition"
              >
                Done / Saved Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: INTEGRATION HUB GRID */}
      {activeTab === 'hub' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
            {(Array.isArray(integrations) ? integrations : DEFAULT_AVAILABLE_INTEGRATIONS).map(app => {
              const isSyncing = syncingProvider === app.id;
              const isConnecting = connectingProvider === app.id;
              return (
                <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-xl font-black ${app.color}`}>
                          {app.icon}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                            {app.name}
                          </h3>
                          <span className="text-xs text-slate-400 font-medium">{app.category}</span>
                        </div>
                      </div>
                      {renderStatusBadge(app.status)}
                    </div>

                    <p className="text-sm text-slate-600 mt-2 line-clamp-2">{app.description}</p>

                    {/* Connection details */}
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Account:</span>
                        <span className="font-semibold text-slate-700">{app.accountEmail || app.accountName || 'Not Connected'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Last Sync:</span>
                        <span className="font-medium text-slate-700">
                          {app.lastSyncAt ? new Date(app.lastSyncAt).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      {app.lastSyncStatus && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-medium">Sync Result:</span>
                          <span className={`font-semibold ${app.lastSyncStatus === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {app.lastSyncStatus}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    {app.status === 'Connected' ? (
                      <>
                        <button
                          onClick={() => handleTriggerSync(app.id)}
                          disabled={isSyncing}
                          className="flex-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 border border-brand-200"
                        >
                          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                          {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>

                        <button
                          onClick={() => handleTestConnection(app.id)}
                          disabled={testingConnection}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1"
                        >
                          <Zap size={14} className="text-amber-500" /> Test Connection
                        </button>

                        <button
                          onClick={() => openSettingsModal(app)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1"
                        >
                          <Settings size={14} /> Settings
                        </button>
                      </>
                    ) : (
                      <>
                        {app.authType === 'OAuth2' ? (
                          <button
                            onClick={() => handleConnectOAuth(app.id)}
                            disabled={isConnecting}
                            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
                          >
                            <Link2 size={14} /> {isConnecting ? 'Connecting...' : 'Connect Account'}
                          </button>
                        ) : (
                          <button
                            onClick={() => openSettingsModal(app)}
                            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
                          >
                            <Settings size={14} /> Configure Connection
                          </button>
                        )}

                        <button
                          onClick={() => openSettingsModal(app)}
                          className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                        >
                          Details
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: API KEYS MANAGEMENT */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Key className="text-brand-500" size={20} /> Managed API Keys
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate secure API access tokens for external HRMS integrations & webhooks.
                </p>
              </div>

              <button
                onClick={() => setIsCreateKeyOpen(true)}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-2 shadow-sm"
              >
                + Create API Key
              </button>
            </div>

            {/* API Keys Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Key Name</th>
                    <th className="py-3 px-4">Masked Secret</th>
                    <th className="py-3 px-4">Scopes</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Used</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!Array.isArray(apiKeys) || apiKeys.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                        No API keys generated yet. Click "+ Create API Key" to issue a secret token.
                      </td>
                    </tr>
                  ) : (
                    (Array.isArray(apiKeys) ? apiKeys : []).map(key => (
                      <tr key={key.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{key.name}</td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded w-fit">
                          {key.keyMask}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(key.scopes) && key.scopes.map((s: string) => (
                              <span key={s} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {key.status === 'ACTIVE' ? (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              {key.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {key.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleRevokeApiKey(key.id)}
                              className="text-rose-600 hover:text-rose-700 font-medium text-xs bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREATE API KEY MODAL */}
      {isCreateKeyOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Issue New API Key</h3>
              <button onClick={() => setIsCreateKeyOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Key Name / Identifier</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile Application / Payroll Bot"
                  value={newKeyForm.name}
                  onChange={e => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Permissions & Scopes</label>
                <div className="space-y-2">
                  {['read:employees', 'write:employees', 'write:attendance', 'read:payroll', 'read:invoices', 'write:invoices', 'read:tenders'].map(scope => (
                    <label key={scope} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newKeyForm.scopes.includes(scope)}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...newKeyForm.scopes, scope]
                            : newKeyForm.scopes.filter(s => s !== scope);
                          setNewKeyForm({ ...newKeyForm, scopes: updated });
                        }}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="font-mono text-xs">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rate Limit (Requests / Hour)</label>
                <select
                  value={newKeyForm.rateLimit}
                  onChange={e => setNewKeyForm({ ...newKeyForm, rateLimit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none"
                >
                  <option value={1000}>1,000 req/hr (Standard)</option>
                  <option value={5000}>5,000 req/hr (Enterprise)</option>
                  <option value={10000}>10,000 req/hr (High Throughput)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateKeyOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingApiKey}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm shadow-md shadow-brand-600/20"
                >
                  {creatingApiKey ? 'Creating...' : 'Generate Secret Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROVIDER SETTINGS / DETAILS MODAL */}
      {isSettingsOpen && selectedProvider && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-black ${selectedProvider.color}`}>
                  {selectedProvider.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedProvider.name} Configuration</h3>
                  <p className="text-xs text-slate-500">Configure credentials, authentication settings, and run diagnostic tests.</p>
                </div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Diagnostic Test Result Banner */}
            {testResult && (
              <div className={`mb-6 p-4 rounded-xl border text-sm ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  {testResult.success ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-rose-600" />}
                  {testResult.success ? 'Connection Test Passed' : 'Connection Test Failed'}
                </div>
                <p className="text-xs">{testResult.message}</p>
              </div>
            )}

            {/* GOOGLE WORKSPACE OAUTH FORM */}
            {selectedProvider.id === 'google_workspace' && (
              <div className="space-y-4 mb-6">
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-blue-800">
                    <Info size={14} /> Google Workspace OAuth Setup
                  </div>
                  <p>Provide your Google Cloud Console OAuth 2.0 Client ID and Secret to enable OAuth login.</p>
                  <p className="font-mono text-[11px] text-blue-700 bg-white p-1.5 rounded border border-blue-200 mt-1">
                    Redirect URI: http://localhost:5000/api/integrations/google_workspace/oauth/callback
                  </p>
                </div>

                <form onSubmit={handleSaveGoogleOauthConfig} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Google OAuth Client ID</label>
                    <input
                      type="text"
                      required
                      placeholder="123456789-xxxx.apps.googleusercontent.com"
                      value={googleOauthForm.clientId}
                      onChange={e => setGoogleOauthForm({ ...googleOauthForm, clientId: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Google OAuth Client Secret</label>
                    <input
                      type="password"
                      placeholder="GOCSPX-••••••••••••••••"
                      value={googleOauthForm.clientSecret}
                      onChange={e => setGoogleOauthForm({ ...googleOauthForm, clientSecret: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition"
                    >
                      Save OAuth Credentials
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConnectOAuth('google_workspace')}
                      className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1"
                    >
                      <Link2 size={14} /> Start Google OAuth Flow
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SLACK OAUTH FORM */}
            {selectedProvider.id === 'slack' && (
              <div className="space-y-4 mb-6">
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-purple-800">
                    <Info size={14} /> Slack App OAuth Setup
                  </div>
                  <p>Enter your Slack App Client ID and Secret to pair your Slack workspace.</p>
                  <p className="font-mono text-[11px] text-purple-700 bg-white p-1.5 rounded border border-purple-200 mt-1">
                    Redirect URI: http://localhost:5000/api/integrations/slack/oauth/callback
                  </p>
                </div>

                <form onSubmit={handleSaveSlackOauthConfig} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Slack Client ID</label>
                      <input
                        type="text"
                        required
                        placeholder="123456.7890"
                        value={slackOauthForm.clientId}
                        onChange={e => setSlackOauthForm({ ...slackOauthForm, clientId: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Default Channel</label>
                      <input
                        type="text"
                        placeholder="#general"
                        value={slackOauthForm.defaultChannel}
                        onChange={e => setSlackOauthForm({ ...slackOauthForm, defaultChannel: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Slack Client Secret</label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={slackOauthForm.clientSecret}
                      onChange={e => setSlackOauthForm({ ...slackOauthForm, clientSecret: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition"
                    >
                      Save Slack App Credentials
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConnectOAuth('slack')}
                      className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1"
                    >
                      <Link2 size={14} /> Start Slack OAuth Flow
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SAP FORM */}
            {selectedProvider.id === 'sap' && (
              <form onSubmit={handleSaveSapConfig} className="space-y-4 mb-6">
                <h4 className="font-bold text-slate-800 text-sm border-b pb-2">SAP ERP OData Connection Parameters</h4>
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">SAP Host / Base URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://sap-instance.company.com:8000/sap/opu/odata/sap/"
                    value={sapForm.baseUrl}
                    onChange={e => setSapForm({ ...sapForm, baseUrl: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Client ID</label>
                    <input
                      type="text"
                      placeholder="100"
                      value={sapForm.client}
                      onChange={e => setSapForm({ ...sapForm, client: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Environment</label>
                    <select
                      value={sapForm.environment}
                      onChange={e => setSapForm({ ...sapForm, environment: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                    >
                      <option value="Sandbox">Sandbox / Development</option>
                      <option value="Production">Production</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">SAP Username</label>
                    <input
                      type="text"
                      placeholder="SAP_SERVICE_USER"
                      value={sapForm.username}
                      onChange={e => setSapForm({ ...sapForm, username: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">SAP Password</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={sapForm.password}
                      onChange={e => setSapForm({ ...sapForm, password: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('sap')}
                    disabled={testingConnection}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Zap size={16} /> {testingConnection ? 'Testing Connection...' : 'Test Connection'}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
                  >
                    Save & Connect SAP ERP
                  </button>
                </div>
              </form>
            )}

            {/* TALLY FORM */}
            {selectedProvider.id === 'tally' && (
              <form onSubmit={handleSaveTallyConfig} className="space-y-4 mb-6">
                <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Tally Prime HTTP Server Setup</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tally Host IP / Domain</label>
                    <input
                      type="text"
                      required
                      placeholder="http://localhost or http://192.168.1.50"
                      value={tallyForm.host}
                      onChange={e => setTallyForm({ ...tallyForm, host: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Port</label>
                    <input
                      type="number"
                      required
                      value={tallyForm.port}
                      onChange={e => setTallyForm({ ...tallyForm, port: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tally Company Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Zenia HR Solutions Pvt Ltd"
                    value={tallyForm.companyName}
                    onChange={e => setTallyForm({ ...tallyForm, companyName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('tally')}
                    disabled={testingConnection}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Zap size={16} /> {testingConnection ? 'Testing Connection...' : 'Test Connection'}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
                  >
                    Save & Connect Tally Prime
                  </button>
                </div>
              </form>
            )}

            {/* SYNC CONFIGURATION */}
            <div className="space-y-4 mb-6">
              <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Sync Engine Preferences</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sync Frequency</label>
                  <select
                    value={syncSettings.syncFrequency}
                    onChange={e => setSyncSettings({ ...syncSettings, syncFrequency: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none"
                  >
                    <option value="Realtime">Realtime (Webhooks)</option>
                    <option value="Hourly">Hourly Scheduled</option>
                    <option value="Daily">Daily Scheduled</option>
                    <option value="Manual">Manual Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sync Direction</label>
                  <select
                    value={syncSettings.syncDirection}
                    onChange={e => setSyncSettings({ ...syncSettings, syncDirection: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none"
                  >
                    <option value="Bidirectional">Bidirectional (2-way)</option>
                    <option value="Import">Import Only (From Provider)</option>
                    <option value="Export">Export Only (To Provider)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                >
                  Save Preferences
                </button>
              </div>
            </div>

            {/* SYNC LOGS & HISTORY */}
            {providerDetails && providerDetails.syncLogs && providerDetails.syncLogs.length > 0 && (
              <div className="space-y-3 mb-6">
                <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Recent Sync History</h4>
                <div className="bg-slate-50 rounded-xl p-3 max-h-40 overflow-y-auto divide-y divide-slate-200/60 text-xs">
                  {providerDetails.syncLogs.map((log: any) => (
                    <div key={log.id} className="py-2 flex justify-between items-center">
                      <div>
                        <span className={`font-bold mr-2 ${log.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          [{log.status}]
                        </span>
                        <span className="text-slate-600">{new Date(log.startedAt).toLocaleString()} ({log.syncType})</span>
                      </div>
                      <span className="text-slate-500 font-mono">
                        Processed: {log.recordsProcessed} | Created: {log.recordsCreated} | Updated: {log.recordsUpdated}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
              {providerDetails && providerDetails.status === 'Connected' && (
                <button
                  onClick={() => handleDisconnect(selectedProvider.id)}
                  className="text-rose-600 hover:bg-rose-50 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1 border border-rose-200"
                >
                  <Trash2 size={14} /> Disconnect Integration
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleTestConnection(selectedProvider.id)}
                  disabled={testingConnection}
                  className="bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold px-4 py-2 rounded-xl text-xs transition"
                >
                  Test Connection
                </button>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationHub;
