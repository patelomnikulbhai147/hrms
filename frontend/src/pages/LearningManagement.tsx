import React, { useState, useEffect } from 'react';
import { BookOpen, Search, PlayCircle, FileText, Plus, Award } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const LearningManagement = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchCourses();
  }, [activeCompanyId]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/lms/courses?companyId=${activeCompanyId}`);
      setCourses(data);
    } catch (err) {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async () => {
    const title = prompt('Course Title:');
    if (!title) return;
    try {
      await api.post('/api/lms/courses', { companyId: activeCompanyId, title, isMandatory: false });
      toast.success('Course created');
      fetchCourses();
    } catch (err) {
      toast.error('Failed to create course');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="text-brand-500" /> Learning Management (LMS)
          </h2>
          <p className="text-sm text-slate-500">Corporate training, courses, and certifications.</p>
        </div>
        <button 
          onClick={handleCreateCourse}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> New Course
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-8 text-center text-slate-500">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            No courses available yet.
          </div>
        ) : (
          courses.map(course => (
            <div key={course.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition">
              <div className="h-32 bg-slate-100 flex items-center justify-center relative">
                <BookOpen size={40} className="text-slate-300" />
                {course.isMandatory && (
                  <span className="absolute top-2 right-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">
                    MANDATORY
                  </span>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-slate-800 line-clamp-1">{course.title}</h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2 flex-1">{course.description || 'No description provided.'}</p>
                
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-500 text-xs">
                    <span className="flex items-center gap-1"><PlayCircle size={14}/> {course.modules?.filter((m:any)=>m.type==='Video').length || 0}</span>
                    <span className="flex items-center gap-1"><FileText size={14}/> {course.modules?.filter((m:any)=>m.type==='PDF').length || 0}</span>
                  </div>
                  <button className="text-brand-600 text-sm font-semibold hover:text-brand-700 transition">
                    Start Course &rarr;
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
