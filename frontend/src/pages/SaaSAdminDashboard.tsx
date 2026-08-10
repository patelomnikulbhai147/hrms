import React, { useState, useEffect } from 'react';
import { Globe, TrendingUp, Users, Activity, Building, Server, DollarSign } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const SaaSAdminDashboard = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSaaSData();
  }, []);

  const fetchSaaSData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/saas/analytics`);
      setData(res);
    } catch (err) {
      toast.error('Failed to load SaaS analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading global SaaS metrics...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Globe className="text-brand-500" /> SaaS Admin Control Panel
          </h2>
          <p className="text-sm text-slate-500">Global metrics, MRR, and multi-tenant management.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-xl shadow-sm text-white">
          <div className="flex justify-between items-start mb-4">
            <p className="text-indigo-100 text-sm font-semibold uppercase tracking-wider">Active Tenants</p>
            <Building className="text-indigo-200" size={20} />
          </div>
          <p className="text-4xl font-black">{data.metrics.activeCompanies}</p>
          <p className="text-indigo-200 text-sm mt-2">Out of {data.metrics.totalCompanies} total registered</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-xl shadow-sm text-white">
          <div className="flex justify-between items-start mb-4">
            <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider">Monthly Recurring Revenue (MRR)</p>
            <DollarSign className="text-emerald-200" size={20} />
          </div>
          <p className="text-4xl font-black">₹{(data.metrics.mrr).toLocaleString()}</p>
          <p className="text-emerald-200 text-sm mt-2 flex items-center gap-1">
            <TrendingUp size={14} /> +8.4% growth
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-sm text-white">
          <div className="flex justify-between items-start mb-4">
            <p className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Annual Run Rate (ARR)</p>
            <TrendingUp className="text-blue-200" size={20} />
          </div>
          <p className="text-4xl font-black">₹{(data.metrics.arr).toLocaleString()}</p>
          <p className="text-blue-200 text-sm mt-2">Projected for current fiscal</p>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-xl shadow-sm text-white">
          <div className="flex justify-between items-start mb-4">
            <p className="text-rose-100 text-sm font-semibold uppercase tracking-wider">Churn Rate</p>
            <Activity className="text-rose-200" size={20} />
          </div>
          <p className="text-4xl font-black">{data.metrics.churnRate}%</p>
          <p className="text-rose-200 text-sm mt-2">Healthy (below 2%)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" /> Revenue Growth
          </h3>
          <div className="h-64 flex items-end justify-around gap-4 px-4 pb-4 border-b border-l border-slate-100 relative">
            {data.revenueTrend.map((t:any, i:number) => (
              <div key={i} className="flex flex-col items-center gap-2 group w-full">
                <div 
                  className="w-full max-w-[4rem] bg-emerald-200 rounded-t-sm group-hover:bg-emerald-300 transition relative"
                  style={{ height: `${(t.revenue / 500000) * 100}%` }}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition">
                    ₹{(t.revenue/1000)}k
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-500">{t.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Server size={18} className="text-blue-500" /> Server Health & Limits
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-700">Database Storage</span>
                <span className="text-slate-500">42GB / 100GB</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '42%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-700">API Request Volume</span>
                <span className="text-slate-500">1.2M / 5M</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: '24%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-700">Active WebSocket Connections</span>
                <span className="text-slate-500">840 / 5000</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '16%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
