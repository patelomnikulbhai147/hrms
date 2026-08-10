import React, { useState, useEffect } from 'react';
import { Target, Search, Plus, Filter, CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const PerformanceManagement = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('goals'); // goals | reviews

  useEffect(() => {
    if (activeCompanyId) fetchGoals();
  }, [activeCompanyId]);

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/performance/goals?companyId=${activeCompanyId}`);
      setGoals(data);
    } catch (err) {
      toast.error('Failed to load performance goals');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async () => {
    const title = prompt('Enter Goal Title:');
    if (!title) return;
    
    try {
      await api.post('/api/performance/goals', { 
        companyId: activeCompanyId, 
        employeeId: 1, // mock employee
        title, 
        type: 'OKR' 
      });
      toast.success('Goal created');
      fetchGoals();
    } catch (err) {
      toast.error('Failed to create goal');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="text-brand-500" /> Performance Management
          </h2>
          <p className="text-sm text-slate-500">Track OKRs, KPIs, and perform 360° evaluations.</p>
        </div>
        <button 
          onClick={handleCreateGoal}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> New Goal
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('goals')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'goals' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          My Goals & OKRs
        </button>
        <button 
          onClick={() => setActiveTab('reviews')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'reviews' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Performance Reviews
        </button>
      </div>

      {activeTab === 'goals' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading goals...</div>
          ) : goals.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No goals set. Create your first OKR.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {goals.map(goal => (
                <div key={goal.id} className="p-4 hover:bg-slate-50 transition flex items-start gap-4">
                  <div className="pt-1">
                    {goal.progress >= 100 ? (
                      <CheckCircle2 className="text-emerald-500" size={20} />
                    ) : (
                      <Circle className="text-slate-300" size={20} />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800">{goal.title}</h3>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{goal.type}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{goal.description || 'No description provided.'}</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${goal.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-600">{goal.progress}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-500">No active review cycles for you at this time.</p>
        </div>
      )}
    </div>
  );
};
