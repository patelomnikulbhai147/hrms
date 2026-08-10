import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "@/App";
import { ErrorBoundary } from "@/ErrorBoundary";
import { authStorage } from "@/utils/authStorage";
import { DialogHost } from "@/components/ui/feedback";

// Resolve session persistence BEFORE React reads any auth state: prune a
// non-remembered session only when the browser session has actually ended.
authStorage.initSession();

// If the user visits a /portal route, load the Client Portal App instead of the main HRMS App
let RootComponent = App;
if (window.location.pathname.startsWith('/portal')) {
  RootComponent = React.lazy(() => import('@/PortalApp').then(m => ({ default: m.PortalApp })));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div></div>}>
        <RootComponent />
      </React.Suspense>
      <DialogHost />
    </ErrorBoundary>
  </StrictMode>
);
// trigger vite reload
