/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL the frontend uses to reach the backend API.
   *  Dev default: http://localhost:5000/api
   *  Prod (behind nginx proxy): /api */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
