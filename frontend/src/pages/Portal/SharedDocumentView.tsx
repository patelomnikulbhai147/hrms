import React, { useState, useEffect } from 'react';
import { Shield, FileText, Download, Lock, Key, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const SharedDocumentView = ({ token }: { token: string }) => {
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<any>(null);
  const [error, setError] = useState('');
  
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otp, setOtp] = useState('');

  useEffect(() => {
    verifyLink();
  }, [token]);

  const verifyLink = async (pwd?: string, pin?: string) => {
    setLoading(true);
    setError('');
    
    try {
      const payload: any = { token };
      if (pwd) payload.password = pwd;
      if (pin) payload.otp = pin;

      const res = await fetch('/api/share/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (res.success) {
        setDocument(res.document);
      } else {
        if (res.requiresPassword) {
          setRequiresPassword(true);
        } else if (res.requiresOtp) {
          setRequiresOtp(true);
        } else {
          setError(res.message || 'Invalid or expired link');
        }
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Please enter the password');
      return;
    }
    verifyLink(password);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      toast.error('Please enter the OTP');
      return;
    }
    verifyLink(password, otp);
  };

  const handleDownload = () => {
    toast.success('Downloading document...');
    // Real implementation would stream the file from a signed S3 URL or similar
    setTimeout(() => {
      const a = window.document.createElement('a');
      a.href = '#'; // document.fileUrl
      a.download = document.name;
      a.click();
    }, 1000);
  };

  if (loading && !requiresPassword && !requiresOtp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <AlertCircle size={48} className="mx-auto text-rose-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (requiresPassword && !document) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <Lock size={48} className="mx-auto text-brand-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Password Required</h2>
          <p className="text-slate-600 text-sm mb-6">This document is protected. Please enter the password to view it.</p>
          
          <form onSubmit={handlePasswordSubmit}>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-slate-300 rounded-lg p-3 text-center mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-3 font-medium transition"
            >
              {loading ? 'Verifying...' : 'Unlock Document'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (requiresOtp && !document) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <Key size={48} className="mx-auto text-brand-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">OTP Verification Required</h2>
          <p className="text-slate-600 text-sm mb-6">An OTP has been sent to the registered email/phone.</p>
          
          <form onSubmit={handleOtpSubmit}>
            <input 
              type="text" 
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter 6-digit OTP"
              className="w-full border border-slate-300 rounded-lg p-3 text-center tracking-widest font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={6}
            />
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-3 font-medium transition"
            >
              {loading ? 'Verifying...' : 'Verify Access'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <Shield className="text-emerald-400" size={24} />
          <div>
            <h1 className="font-bold text-sm tracking-wide">Secure Document Viewer</h1>
            <p className="text-xs text-slate-400 truncate max-w-[200px] md:max-w-md">{document.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {!document.disablePrint && (
            <button onClick={handleDownload} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition">
              <Download size={16} /> <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="bg-white shadow-2xl border border-slate-200 w-full max-w-5xl rounded-lg overflow-hidden flex flex-col min-h-[70vh] relative select-none">
          {document.watermark && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] rotate-[-30deg]">
              <span className="text-9xl font-black uppercase text-slate-900 break-words whitespace-pre-wrap text-center leading-[0.8]">
                CONFIDENTIAL<br/>CONFIDENTIAL<br/>CONFIDENTIAL
              </span>
            </div>
          )}
          
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText size={64} className="mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">{document.name}</h3>
            <p className="text-sm">Securely shared via Enterprise Document Vault</p>
            
            <div className="mt-8 max-w-lg w-full bg-slate-50 rounded border border-slate-200 p-4 font-mono text-xs text-slate-500">
              <p>Type: {document.type}</p>
              <p>Size: {document.size ? `${(document.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}</p>
              <p>Access Granted: {new Date().toLocaleString()}</p>
            </div>
            
            <p className="mt-8 text-xs max-w-md text-center">
              (Preview implementation placeholder - Real implementation uses a PDF.js viewer or iframe sandboxed view)
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
