import React, { useState, useEffect } from 'react';
import { UserCheck, Search, Plus, QrCode } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const VisitorManagement = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchVisitors();
  }, [activeCompanyId]);

  const fetchVisitors = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/visitors?companyId=${activeCompanyId}`);
      setVisitors(data);
    } catch (err) {
      toast.error('Failed to load visitors');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Visitor Name:');
    const phone = prompt('Visitor Phone:');
    const purpose = prompt('Purpose of Visit:');
    if (!name || !phone || !purpose) return;
    
    try {
      await api.post('/api/visitors', { companyId: activeCompanyId, name, phone, purpose });
      toast.success('Visitor registered');
      fetchVisitors();
    } catch (err) {
      toast.error('Failed to register visitor');
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await api.post(`/api/visitors/${id}/status`, { status });
      toast.success(`Visitor status updated to ${status}`);
      fetchVisitors();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserCheck className="text-brand-500" /> Visitor Management
          </h2>
          <p className="text-sm text-slate-500">Track and manage office visitors securely.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> Register Visitor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading visitors...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Visitor Name</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Phone</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Purpose</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Status</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visitors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No visitors found.
                    </td>
                  </tr>
                ) : (
                  visitors.map(visitor => (
                    <tr key={visitor.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-medium text-slate-800">{visitor.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">{visitor.phone}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{visitor.purpose}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          visitor.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                          visitor.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                          visitor.status === 'Entered' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {visitor.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {visitor.status === 'Pending' && (
                            <button onClick={() => handleUpdateStatus(visitor.id, 'Approved')} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded transition">Approve</button>
                          )}
                          {visitor.status === 'Approved' && (
                            <button onClick={() => handleUpdateStatus(visitor.id, 'Entered')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-2 py-1 rounded transition">Check In</button>
                          )}
                          {visitor.status === 'Entered' && (
                            <button onClick={() => handleUpdateStatus(visitor.id, 'Exited')} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition">Check Out</button>
                          )}
                          <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition" title="Show QR Code">
                            <QrCode size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
