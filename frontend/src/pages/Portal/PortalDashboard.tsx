import React, { useState, useEffect } from 'react';
import { 
  LogOut, LayoutDashboard, FileText, Download, Bell, UserCircle, 
  Search, ShieldCheck, Clock, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const PortalDashboard = ({ onLogout }: { onLogout: () => void }) => {
  const [profile, setProfile] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('hrms_portal_token');
      const res = await fetch('/api/portal/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());

      if (res.success) {
        setProfile(res.user);
        setDocuments(res.documents || []);
      } else {
        toast.error('Session expired');
        onLogout();
      }
    } catch (err) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (doc: any) => {
    toast.success(`Downloading ${doc.name}...`);
    // Mock download logic
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = doc.fileUrl || '#';
      a.download = doc.name;
      a.click();
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-brand-400 mb-1">
            <ShieldCheck size={24} />
            <span className="font-bold text-xl tracking-tight">Client Portal</span>
          </div>
          <p className="text-xs text-slate-400">Secure Document Access</p>
        </div>
        
        <div className="flex-1 py-6 space-y-1">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition ${activeTab === 'overview' ? 'bg-brand-600/10 text-brand-400 border-r-2 border-brand-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition ${activeTab === 'documents' ? 'bg-brand-600/10 text-brand-400 border-r-2 border-brand-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <FileText size={18} /> My Documents
          </button>
        </div>
        
        <div className="p-6 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-300">
              <UserCircle size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.name}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.companyName}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm transition"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 capitalize">
            {activeTab}
          </h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search documents..." 
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-700">Total Documents</h3>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                      <FileText size={20} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{documents.length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-700">Pending Actions</h3>
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                      <Clock size={20} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">0</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-700">Completed</h3>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 size={20} />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">0</p>
                </div>
              </div>

              {/* Recent Documents */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Recent Documents</h3>
                  <button onClick={() => setActiveTab('documents')} className="text-sm font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
                    View All <ChevronRight size={16} />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {documents.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      No documents available yet.
                    </div>
                  ) : (
                    documents.slice(0, 5).map(doc => (
                      <div key={doc.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-50 transition">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-slate-800">{doc.name}</p>
                            <p className="text-xs text-slate-500">Shared on {new Date(doc.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDownload(doc)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold border-b border-slate-200">Document Name</th>
                      <th className="px-6 py-4 font-semibold border-b border-slate-200">Type</th>
                      <th className="px-6 py-4 font-semibold border-b border-slate-200">Date Added</th>
                      <th className="px-6 py-4 font-semibold border-b border-slate-200">Size</th>
                      <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No documents have been shared with you yet.
                        </td>
                      </tr>
                    ) : (
                      documents.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <FileText size={18} className="text-brand-500" />
                              <span className="font-medium text-sm text-slate-800">{doc.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                              {doc.type || 'PDF'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {doc.size ? `${(doc.size / 1024 / 1024).toFixed(2)} MB` : '--'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleDownload(doc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-medium rounded-md transition"
                            >
                              <Download size={14} /> Download
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
