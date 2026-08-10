import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, CopyX, CheckCircle, Mail, MessageCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const TemplateAnalytics = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real application, this would fetch from an analytics API endpoint
    // For now, we simulate the aggregation locally using the templates API
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const activeCompanyId = localStorage.getItem('hrms_active_company_id');
      const res = await fetch(`/api/templates?companyId=${activeCompanyId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hrms_token')}` }
      }).then(r => r.json());
      
      if (res.success) {
        const templates = res.templates || [];
        
        const totalGenerated = templates.reduce((acc: number, t: any) => acc + (t._count?.usageLogs || 0), 0);
        const unused = templates.filter((t: any) => !t._count?.usageLogs || t._count.usageLogs === 0).length;
        const topTemplates = [...templates].sort((a: any, b: any) => (b._count?.usageLogs || 0) - (a._count?.usageLogs || 0)).slice(0, 3);

        setStats({
          totalTemplates: templates.length,
          totalGenerated,
          unusedCount: unused,
          topTemplates
        });
      }
    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!stats) return null;

  // Mock timeline data for demonstration of the new tracking features
  const mockTimeline = [
    { id: 1, docName: 'Offer Letter V2', employee: 'John Doe', action: 'Verified via QR', time: '10 mins ago', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 2, docName: 'Invoice #4021', employee: 'Acme Corp', action: 'Opened Email', time: '2 hours ago', icon: Eye, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 3, docName: 'Salary Slip May', employee: 'Jane Smith', action: 'Sent via WhatsApp', time: '5 hours ago', icon: MessageCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { id: 4, docName: 'Relieving Letter', employee: 'Alex Jones', action: 'Sent via Email', time: '1 day ago', icon: Mail, color: 'text-slate-500', bg: 'bg-slate-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-brand-50 p-3 rounded-xl text-brand-600"><BarChart3 size={24} /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Templates</p>
            <h4 className="text-2xl font-bold text-slate-800">{stats.totalTemplates}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><TrendingUp size={24} /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Documents Generated</p>
            <h4 className="text-2xl font-bold text-slate-800">{stats.totalGenerated}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 p-3 rounded-xl text-amber-600"><Users size={24} /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Active Assignments</p>
            <h4 className="text-2xl font-bold text-slate-800">0</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-rose-50 p-3 rounded-xl text-rose-600"><CopyX size={24} /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Unused Templates</p>
            <h4 className="text-2xl font-bold text-slate-800">{stats.unusedCount}</h4>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Most Used Templates</h3>
        </div>
        <div className="p-6">
          {stats.topTemplates.length > 0 && stats.topTemplates[0]._count?.usageLogs > 0 ? (
            <div className="space-y-4">
              {stats.topTemplates.map((t: any, i: number) => (
                <div key={t.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-800">{t.name}</h4>
                    <p className="text-sm text-slate-500">{t.type}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-brand-600">{t._count?.usageLogs || 0}</span>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Generations</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500">
              No usage data available yet. Start generating documents to see analytics.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Live Document Timeline</h3>
          <p className="text-xs text-slate-500 mt-1">Track delivery, opens, and QR verifications</p>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {mockTimeline.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-start gap-4 relative">
                  {i !== mockTimeline.length - 1 && (
                    <div className="absolute top-10 left-5 w-0.5 h-full -ml-px bg-slate-100"></div>
                  )}
                  <div className={`p-2 rounded-full ${item.bg} ${item.color} z-10 ring-4 ring-white`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.docName} <span className="font-normal text-slate-500">for {item.employee}</span>
                    </p>
                    <p className="text-xs font-medium text-slate-600 mt-0.5">{item.action}</p>
                    <p className="text-xs text-slate-400 mt-1">{item.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
