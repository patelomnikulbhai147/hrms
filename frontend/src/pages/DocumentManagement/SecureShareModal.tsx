import React, { useState } from 'react';
import { X, Link2, Shield, EyeOff, Clock, Copy, Lock, Settings2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const SecureShareModal = ({ document, onClose }: { document: any, onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [settings, setSettings] = useState({
    expiresInDays: 7,
    maxDownloads: 1,
    password: '',
    requireOtp: false,
    watermark: true,
    disablePrint: true
  });

  const generateLink = async () => {
    setLoading(true);
    try {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + settings.expiresInDays);

      const res = await fetch('/api/share/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`
        },
        body: JSON.stringify({
          documentId: document.id,
          expiresAt: expiry.toISOString(),
          maxDownloads: settings.maxDownloads,
          password: settings.password || undefined,
          requireOtp: settings.requireOtp,
          watermark: settings.watermark,
          disablePrint: settings.disablePrint
        })
      }).then(r => r.json());

      if (res.success) {
        // Construct public portal URL
        const url = `${window.location.origin}/portal/share/${res.link.token}`;
        setShareLink(url);
        toast.success('Secure link generated!');
      } else {
        toast.error('Failed to generate link');
      }
    } catch (err) {
      toast.error('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-brand-50">
          <div className="flex items-center gap-2 text-brand-700">
            <Shield size={20} />
            <h3 className="font-bold">Secure Share</h3>
          </div>
          <button onClick={onClose} className="p-1 text-brand-500 hover:text-brand-700 hover:bg-brand-100 rounded">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <p className="text-sm font-medium text-slate-800 mb-1">Sharing: {document.name}</p>
          <p className="text-xs text-slate-500 mb-6">Configure access controls before generating a public link.</p>
          
          {!shareLink ? (
            <div className="space-y-5">
              {/* Basic Constraints */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                    <Clock size={14} /> Expiry (Days)
                  </label>
                  <input 
                    type="number" 
                    value={settings.expiresInDays}
                    onChange={e => setSettings({...settings, expiresInDays: parseInt(e.target.value)})}
                    className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-1 focus:ring-brand-500" 
                    min="1" max="30"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                    <Copy size={14} /> Max Downloads
                  </label>
                  <input 
                    type="number" 
                    value={settings.maxDownloads}
                    onChange={e => setSettings({...settings, maxDownloads: parseInt(e.target.value)})}
                    className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-1 focus:ring-brand-500" 
                    min="1"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                  <Lock size={14} /> Password Protect (Optional)
                </label>
                <input 
                  type="password" 
                  placeholder="Leave blank for no password"
                  value={settings.password}
                  onChange={e => setSettings({...settings, password: e.target.value})}
                  className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-1 focus:ring-brand-500" 
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5 mb-2">
                  <Settings2 size={14}/> Advanced Security
                </h4>
                
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-brand-600 transition">Require OTP via Email/SMS</span>
                  <input type="checkbox" checked={settings.requireOtp} onChange={e => setSettings({...settings, requireOtp: e.target.checked})} className="rounded text-brand-600 focus:ring-brand-500" />
                </label>
                
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-brand-600 transition">Apply Digital Watermark</span>
                  <input type="checkbox" checked={settings.watermark} onChange={e => setSettings({...settings, watermark: e.target.checked})} className="rounded text-brand-600 focus:ring-brand-500" />
                </label>
                
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-brand-600 transition flex items-center gap-1.5"><EyeOff size={14}/> Disable Print & Copy</span>
                  <input type="checkbox" checked={settings.disablePrint} onChange={e => setSettings({...settings, disablePrint: e.target.checked})} className="rounded text-brand-600 focus:ring-brand-500" />
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center">
              <Link2 size={40} className="mx-auto text-emerald-500 mb-3" />
              <h4 className="font-bold text-emerald-800 mb-2">Link Ready!</h4>
              <p className="text-xs text-emerald-600 mb-4">Anyone with this link (and the password if set) can access the document.</p>
              
              <div className="flex items-center gap-2 mb-4">
                <input 
                  type="text" 
                  readOnly 
                  value={shareLink} 
                  className="flex-1 border border-emerald-200 bg-white rounded p-2 text-xs font-mono focus:outline-none"
                />
                <button 
                  onClick={copyToClipboard}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded font-medium text-xs transition flex items-center gap-1"
                >
                  <Copy size={14}/> Copy
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          {!shareLink ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition">
                Cancel
              </button>
              <button 
                onClick={generateLink}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-sm"
              >
                {loading ? 'Generating...' : 'Generate Secure Link'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
