import React, { useState, useEffect } from 'react';
import { MessageSquare, Heart, MessageCircle, Share2, Image as ImageIcon, Send, Sparkles } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const InternalCommunication = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');

  useEffect(() => {
    if (activeCompanyId) fetchPosts();
  }, [activeCompanyId]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/social/posts?companyId=${activeCompanyId}`);
      setPosts(data);
    } catch (err) {
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newPost.trim()) return;
    try {
      await api.post('/api/social/posts', { 
        companyId: activeCompanyId, 
        authorId: 1, // mock employee
        content: newPost,
        type: 'Post'
      });
      setNewPost('');
      toast.success('Posted successfully');
      fetchPosts();
    } catch (err) {
      toast.error('Failed to create post');
    }
  };

  const handleLike = async (id: number) => {
    try {
      await api.post(`/api/social/posts/${id}/like`, {});
      fetchPosts(); // Refresh likes
    } catch (err) {
      toast.error('Failed to like post');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-slate-800 flex items-center justify-center gap-3">
          <Sparkles className="text-brand-500" /> Internal Communication
        </h2>
        <p className="text-slate-500 mt-2">Company announcements, polls, and social feed.</p>
      </div>

      {/* Create Post Box */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold shrink-0">
            JD
          </div>
          <div className="flex-1">
            <textarea 
              value={newPost}
              onChange={e => setNewPost(e.target.value)}
              placeholder="What's happening in your team?" 
              className="w-full resize-none border-none focus:ring-0 p-0 text-slate-800 placeholder:text-slate-400 bg-transparent text-lg"
              rows={3}
            />
            <div className="border-t border-slate-100 pt-3 mt-2 flex justify-between items-center">
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 rounded-full transition">
                  <ImageIcon size={20} />
                </button>
                <button className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 rounded-full transition">
                  <MessageSquare size={20} />
                </button>
              </div>
              <button 
                onClick={handlePost}
                disabled={!newPost.trim()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-full font-medium flex items-center gap-2 transition"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center p-8 text-slate-500">Loading feed...</div>
        ) : posts.length === 0 ? (
          <div className="text-center p-8 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            No posts yet. Be the first to start the conversation!
          </div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold shrink-0">
                  U
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">Employee Name</h3>
                    <span className="text-xs text-slate-400">• {new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-700 mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-slate-500 max-w-sm">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className="flex items-center gap-2 hover:text-rose-500 group transition"
                    >
                      <div className="p-2 rounded-full group-hover:bg-rose-50 transition">
                        <Heart size={18} className={post.likesCount > 0 ? 'text-rose-500 fill-rose-500' : ''} />
                      </div>
                      <span className="text-sm font-medium">{post.likesCount || ''}</span>
                    </button>
                    <button className="flex items-center gap-2 hover:text-brand-500 group transition">
                      <div className="p-2 rounded-full group-hover:bg-brand-50 transition">
                        <MessageCircle size={18} />
                      </div>
                    </button>
                    <button className="flex items-center gap-2 hover:text-emerald-500 group transition">
                      <div className="p-2 rounded-full group-hover:bg-emerald-50 transition">
                        <Share2 size={18} />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
