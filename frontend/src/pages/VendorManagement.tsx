import React, { useState, useEffect } from 'react';
import { Building2, Search, Plus, Filter, MoreVertical, Trash2 } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const VendorManagement = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (activeCompanyId) fetchVendors();
  }, [activeCompanyId]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/vendors?companyId=${activeCompanyId}`);
      setVendors(data);
    } catch (err) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Enter Vendor Name:');
    if (!name) return;
    try {
      await api.post('/api/vendors', { companyId: activeCompanyId, name, status: 'Active' });
      toast.success('Vendor created');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to create vendor');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this vendor?')) return;
    try {
      await api.delete(`/api/vendors/${id}`);
      toast.success('Vendor deleted');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to delete vendor');
    }
  };

  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="text-brand-500" /> Vendor Management
          </h2>
          <p className="text-sm text-slate-500">Manage suppliers, contractors, and service providers.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> Add Vendor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search vendors..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <button className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition">
            <Filter size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading vendors...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Vendor Name</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Contact</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Status</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Rating</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No vendors found. Add your first vendor.
                    </td>
                  </tr>
                ) : (
                  filtered.map(vendor => (
                    <tr key={vendor.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-medium text-slate-800">{vendor.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {vendor.contactName || '--'}<br/>
                        <span className="text-xs text-slate-400">{vendor.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${vendor.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                          {vendor.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{vendor.rating.toFixed(1)} / 5</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleDelete(vendor.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition">
                            <Trash2 size={16} />
                          </button>
                          <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition">
                            <MoreVertical size={16} />
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
