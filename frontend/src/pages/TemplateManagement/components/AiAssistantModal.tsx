import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const AiAssistantModal = ({ 
  isOpen, 
  onClose, 
  onGenerate, 
  type 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onGenerate: (html: string) => void;
  type: string;
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt.');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/templates/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`
        },
        body: JSON.stringify({ prompt, type })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Template generated successfully!');
        onGenerate(data.html);
        onClose();
      } else {
        toast.error(data.message || 'Failed to generate template');
      }
    } catch (error) {
      console.error(error);
      toast.error('Server error during AI generation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-brand-50">
          <div className="flex items-center gap-2 text-brand-700">
            <Sparkles size={20} />
            <h3 className="font-bold">AI Template Generator</h3>
          </div>
          <button onClick={onClose} className="p-1 text-brand-500 hover:text-brand-700 hover:bg-brand-100 rounded">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Describe the document you want to create. The AI will automatically generate the layout and insert appropriate {{variables}} for a <strong>{type}</strong>.
          </p>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none text-sm"
            placeholder="e.g. Generate a formal offer letter with a header for the company logo, a standard greeting, a table for compensation details, and a signature block at the bottom."
            autoFocus
          />
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Generating...' : 'Generate Template'}
          </button>
        </div>
      </div>
    </div>
  );
};
