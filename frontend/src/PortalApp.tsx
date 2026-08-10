import React, { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/api/apiClient';

const PortalLogin = React.lazy(() => import('@/pages/Portal/PortalLogin').then(m => ({ default: m.PortalLogin })));
const PortalDashboard = React.lazy(() => import('@/pages/Portal/PortalDashboard').then(m => ({ default: m.PortalDashboard })));
const SharedDocumentView = React.lazy(() => import('@/pages/Portal/SharedDocumentView').then(m => ({ default: m.SharedDocumentView })));

export const PortalApp = () => {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('hrms_portal_token');
  });

  useEffect(() => {
    const handlePop = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = (path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
  };

  const handleLogin = (token: string) => {
    localStorage.setItem('hrms_portal_token', token);
    setIsAuthenticated(true);
    navigate('/portal/dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('hrms_portal_token');
    setIsAuthenticated(false);
    navigate('/portal/login');
  };

  // Route matching
  if (currentPath.startsWith('/portal/share/')) {
    const token = currentPath.replace('/portal/share/', '');
    return <SharedDocumentView token={token} />;
  }

  if (currentPath === '/portal' || currentPath === '/portal/') {
    navigate(isAuthenticated ? '/portal/dashboard' : '/portal/login');
    return null;
  }

  if (!isAuthenticated && currentPath !== '/portal/login') {
    navigate('/portal/login');
    return null;
  }

  if (currentPath === '/portal/login') {
    return <PortalLogin onLogin={handleLogin} />;
  }

  if (currentPath === '/portal/dashboard') {
    return <PortalDashboard onLogout={handleLogout} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-center p-8">
      <ShieldAlert size={48} className="text-rose-500 mb-4" />
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
      <p className="text-slate-500 max-w-md mb-6">The portal page you are looking for does not exist.</p>
      <button 
        onClick={() => navigate('/portal/dashboard')}
        className="bg-brand-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-700 transition"
      >
        Return to Dashboard
      </button>
    </div>
  );
};
