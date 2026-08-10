import React, { useState, useEffect } from 'react';
import { Book, Folder, FileText, Plus, Search, ChevronRight } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const KnowledgeBase = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchKnowledge();
  }, [activeCompanyId]);

  const fetchKnowledge = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/knowledge/articles?companyId=${activeCompanyId}`);
      setCategories(data);
    } catch (err) {
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    const name = prompt('Category Name (e.g. HR Policies):');
    if (!name) return;
    try {
      await api.post('/api/knowledge/categories', { companyId: activeCompanyId, name });
      toast.success('Category created');
      fetchKnowledge();
    } catch (err) {
      toast.error('Failed to create category');
    }
  };

  const handleCreateArticle = async (categoryId: number) => {
    const title = prompt('Article Title:');
    if (!title) return;
    try {
      await api.post('/api/knowledge/articles', { categoryId, title, content: 'Content goes here...' });
      toast.success('Article created');
      fetchKnowledge();
    } catch (err) {
      toast.error('Failed to create article');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Book className="text-brand-500" /> Knowledge Base
          </h2>
          <p className="text-sm text-slate-500">Company policies, SOPs, and documentation.</p>
        </div>
        <button 
          onClick={handleCreateCategory}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> New Category
        </button>
      </div>

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search policies, SOPs, FAQs..." 
          className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {loading ? (
          <div className="col-span-full p-8 text-center text-slate-500">Loading knowledge base...</div>
        ) : categories.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            No categories found.
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-100 text-brand-600 rounded-lg">
                    <Folder size={20} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">{cat.name}</h3>
                </div>
                <button 
                  onClick={() => handleCreateArticle(cat.id)}
                  className="text-brand-600 hover:bg-brand-50 p-1.5 rounded transition"
                  title="Add Article"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="p-2">
                {cat.articles?.length === 0 ? (
                  <p className="p-4 text-sm text-slate-400 italic">No articles in this category.</p>
                ) : (
                  cat.articles?.map((article: any) => (
                    <button key={article.id} className="w-full text-left p-3 hover:bg-slate-50 rounded-lg transition flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <FileText size={18} className="text-slate-400 group-hover:text-brand-500 transition" />
                        <span className="text-slate-700 font-medium group-hover:text-brand-700 transition">{article.title}</span>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-brand-500 transition" />
                    </button>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
