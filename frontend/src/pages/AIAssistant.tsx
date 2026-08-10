import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, User, Loader2, RefreshCw, Trash2, Sparkles } from 'lucide-react';
import { api } from '@/api/apiClient';

interface AIProps {
  activeCompanyId: string | null;
  role: string;
  authProfile: any;
}

const QUICK_QUESTIONS = [
  'How many active employees are there?',
  'How many employees were absent today?',
  'How many are on leave today?',
  'What is the total payroll this month?',
  'Show pending leave requests.',
  'How many employees joined this month?',
  'Show department headcount breakdown.',
  'Who exited this month?',
];

export const AIAssistant = ({ activeCompanyId, role, authProfile }: AIProps) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeCompanyId) fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res: any = await api.get(`/api/ai/history/${activeCompanyId}`);
      const payload = res.data;
      setMessages(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSend = async (q?: string) => {
    const query = q || input;
    if (!query.trim() || loading) return;
    setInput('');
    setLoading(true);

    // Optimistic user message
    const userMsg = { id: Date.now(), message: query, response: null, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res: any = await api.post('/api/ai/query', {
        companyId: activeCompanyId,
        employeeId: authProfile?.id || null,
        query,
      });
      // Replace the optimistic entry with the real response
      setMessages(prev => prev.map(m => m.id === userMsg.id ? res.data : m));
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === userMsg.id
        ? { ...m, response: `Error: ${err?.message || 'Failed to get response. Please try again.'}` }
        : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => setMessages([]);

  const formatResponse = (text: string) => {
    // Convert **bold** to JSX and line breaks to paragraphs
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className={line.startsWith('•') ? 'pl-2' : ''}>
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-t-xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Bot size={22} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-1.5">
              HR AI Assistant <Sparkles size={14} className="text-amber-400" />
            </h2>
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
              Live HRMS Data · Company Isolated
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHistory}
            title="Reload history"
            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
          >
            <RefreshCw size={15} className={historyLoading ? 'animate-spin' : ''} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              title="Clear conversation"
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/60 border-x border-slate-200">
        {/* Loading history */}
        {historyLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-brand-400" size={24} />
          </div>
        )}

        {/* Empty state */}
        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-indigo-100 flex items-center justify-center">
              <Bot size={32} className="text-brand-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 text-lg mb-2">Ask me anything about your HR data</h3>
              <p className="text-sm text-slate-400 max-w-sm">I have access to your real employee, attendance, payroll, and leave data — all company-isolated.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="text-left text-xs px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition text-slate-600 font-medium"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {!historyLoading && messages.map((msg: any, i: number) => (
          <div key={msg.id || i} className="space-y-4">
            {/* User Message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-brand-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-sm">
                <p className="text-sm leading-relaxed">{msg.message}</p>
              </div>
            </div>

            {/* Bot Response */}
            {msg.response && (
              <div className="flex justify-start">
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                    <Bot size={14} />
                  </div>
                  <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-2xl rounded-tl-sm shadow-sm space-y-1 text-sm leading-relaxed">
                    {formatResponse(msg.response)}
                  </div>
                </div>
              </div>
            )}

            {/* Pending response (optimistic) */}
            {!msg.response && loading && i === messages.length - 1 && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                    <Bot size={14} />
                  </div>
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl p-4 shadow-sm">
        {/* Quick suggestions (when has messages) */}
        {messages.length > 0 && !loading && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {QUICK_QUESTIONS.slice(0, 3).map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 border border-transparent hover:border-brand-200 rounded-full text-slate-500 transition"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about employees, payroll, attendance, leaves…"
            className="w-full pl-4 pr-14 py-4 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-sm bg-slate-50 focus:bg-white transition"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">Responses use real-time data from your company database · Company isolated</p>
      </div>
    </div>
  );
};
