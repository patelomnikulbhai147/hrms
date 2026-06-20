import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "@/App";
import { ErrorBoundary } from "@/ErrorBoundary";
import { authStorage } from "@/utils/authStorage";
import { DialogHost } from "@/components/ui/feedback";

// Resolve session persistence BEFORE React reads any auth state: prune a
// non-remembered session only when the browser session has actually ended.
authStorage.initSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <DialogHost />
    </ErrorBoundary>
  </StrictMode>
);

// trigger vite reload
