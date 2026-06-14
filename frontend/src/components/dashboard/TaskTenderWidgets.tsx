import React, { useEffect, useState } from 'react';
import { ClipboardList, Briefcase, ChevronRight, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../../api/apiClient';

interface Props {
  activeCompanyId: string;
  onNavigate: (page: any) => void;
}

/**
 * Compact Task Manager + Tender Information widgets shown below the dashboard
 * statistics cards. Self-contained (fetches its own data) so it adds to the
 * dashboard without altering any existing dashboard logic or layout.
 */
export const TaskTenderWidgets: React.FC<Props> = ({ activeCompanyId, onNavigate }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [tenders, setTenders] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    api.tasks.getAll().then(d => { if (alive) setTasks(d || []); }).catch(() => {});
    api.tenders.getAll().then(d => { if (alive) setTenders(d || []); }).catch(() => {});
    return () => { alive = false; };
  }, [activeCompanyId]);

  const pending = tasks.filter(t => t.status === 'Pending').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const overdue = tasks.filter(t => t.status === 'Overdue').length;
  const upcomingTenders = tenders.filter(t => t.status === 'Upcoming').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Task Manager widget (spans 2 cols) */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={16} className="text-indigo-600" /> Task Manager</h3>
          <button onClick={() => onNavigate('tasks')} className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5">Open <ChevronRight size={13} /></button>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl bg-amber-50 p-3 text-center"><Clock size={15} className="text-amber-500 mx-auto mb-1" /><p className="text-xl font-extrabold text-amber-700">{pending}</p><p className="text-[10px] font-bold text-amber-500 uppercase">Pending</p></div>
          <div className="rounded-xl bg-blue-50 p-3 text-center"><ClipboardList size={15} className="text-blue-500 mx-auto mb-1" /><p className="text-xl font-extrabold text-blue-700">{inProgress}</p><p className="text-[10px] font-bold text-blue-500 uppercase">Active</p></div>
          <div className="rounded-xl bg-emerald-50 p-3 text-center"><CheckCircle2 size={15} className="text-emerald-500 mx-auto mb-1" /><p className="text-xl font-extrabold text-emerald-700">{completed}</p><p className="text-[10px] font-bold text-emerald-500 uppercase">Done</p></div>
          <div className="rounded-xl bg-rose-50 p-3 text-center"><AlertTriangle size={15} className="text-rose-500 mx-auto mb-1" /><p className="text-xl font-extrabold text-rose-700">{overdue}</p><p className="text-[10px] font-bold text-rose-500 uppercase">Overdue</p></div>
        </div>
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {tasks.slice(0, 4).map(t => (
            <button key={t.id} onClick={() => onNavigate('tasks')} className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
              <span className="text-xs font-semibold text-slate-700 truncate">{t.title}</span>
              <span className={`text-[10px] font-bold ml-2 flex-shrink-0 ${t.status === 'Completed' ? 'text-emerald-600' : t.status === 'Overdue' ? 'text-rose-600' : 'text-amber-600'}`}>{t.status}</span>
            </button>
          ))}
          {tasks.length === 0 && <p className="text-xs text-slate-400 px-3 py-4 text-center">No tasks assigned yet.</p>}
        </div>
      </div>

      {/* Tender Information widget */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Briefcase size={16} className="text-indigo-600" /> Tender Information</h3>
          <button onClick={() => onNavigate('tenders')} className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5">Open <ChevronRight size={13} /></button>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4 text-center flex-1 flex flex-col justify-center">
          <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider">Upcoming Tenders</p>
          <p className="text-4xl font-extrabold text-indigo-700 my-1">{upcomingTenders}</p>
          {upcomingTenders === 0 && <p className="text-[11px] text-slate-400">No Upcoming Tenders Available</p>}
        </div>
        <p className="text-[10px] text-slate-400 mt-3 text-center">Future-ready · No live tender API yet</p>
      </div>
    </div>
  );
};

export default TaskTenderWidgets;
