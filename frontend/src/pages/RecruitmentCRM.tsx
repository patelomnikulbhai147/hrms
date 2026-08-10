import React, { useState, useEffect } from 'react';
import { Briefcase, Search, Plus, Users, FileText, Bot } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const RecruitmentCRM = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchJobs();
  }, [activeCompanyId]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/recruitment/jobs?companyId=${activeCompanyId}`);
      setJobs(data);
    } catch (err) {
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = async () => {
    const title = prompt('Job Title (e.g. Senior Backend Engineer):');
    if (!title) return;
    try {
      await api.post('/api/recruitment/jobs', { 
        companyId: activeCompanyId, 
        title,
        department: 'Engineering',
        description: 'We are looking for a rockstar engineer.',
        vacancies: 1
      });
      toast.success('Job requisition created');
      fetchJobs();
    } catch (err) {
      toast.error('Failed to create job');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="text-brand-500" /> Recruitment CRM
          </h2>
          <p className="text-sm text-slate-500">Manage job postings, candidate pipelines, and interviews.</p>
        </div>
        <button 
          onClick={handleCreateJob}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> New Requisition
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Active Jobs', value: jobs.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Total Candidates', value: jobs.reduce((acc, job) => acc + (job._count?.candidates || 0), 0), color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Interviews Scheduled', value: '12', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Offers Pending', value: '3', color: 'text-rose-600', bg: 'bg-rose-50' }
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm font-semibold text-slate-500 uppercase">{stat.label}</p>
            <p className={`text-3xl font-black mt-2 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-lg">Active Requisitions</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search jobs..." 
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No active job postings.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {jobs.map(job => (
              <div key={job.id} className="p-6 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-bold text-slate-800 text-lg">{job.title}</h4>
                    <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded">{job.status}</span>
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-4">
                    <span>{job.department || 'General'}</span>
                    <span>•</span>
                    <span>{job.type}</span>
                    <span>•</span>
                    <span>{job.vacancies} Vacancies</span>
                  </p>
                </div>
                
                <div className="flex items-center gap-4 border-l border-slate-200 pl-4">
                  <div className="text-center px-4">
                    <p className="text-2xl font-black text-slate-700">{job._count?.candidates || 0}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Candidates</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button className="bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-600 px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2">
                      <Users size={14} /> View Pipeline
                    </button>
                    <button className="bg-brand-50 text-brand-700 hover:bg-brand-100 px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2">
                      <Bot size={14} /> AI Match Candidates
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
