import React, { useState, useEffect } from 'react';
import { Laptop, Search, Plus, Filter, Monitor } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const AssetManagement = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchAssets();
  }, [activeCompanyId]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/assets?companyId=${activeCompanyId}`);
      setAssets(data);
    } catch (err) {
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Enter Asset Name:');
    const assetCode = prompt('Enter Asset Code (e.g. AST-001):');
    if (!name || !assetCode) return;
    try {
      await api.post('/api/assets', { companyId: activeCompanyId, name, assetCode, category: 'Hardware' });
      toast.success('Asset created');
      fetchAssets();
    } catch (err) {
      toast.error('Failed to create asset');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Laptop className="text-brand-500" /> Asset Management
          </h2>
          <p className="text-sm text-slate-500">Track and manage company equipment and hardware.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> Add Asset
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading assets...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Asset Code</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Name</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Category</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      No assets found.
                    </td>
                  </tr>
                ) : (
                  assets.map(asset => (
                    <tr key={asset.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-medium text-slate-800 font-mono">{asset.assetCode}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 flex items-center gap-2">
                        <Monitor size={16} className="text-slate-400" /> {asset.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{asset.category}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${asset.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {asset.status}
                        </span>
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
