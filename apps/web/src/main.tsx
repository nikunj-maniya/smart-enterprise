import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './index.css';

// Default staleTime of 0 means every remount/window-refocus refetches — fine for data that
// changes under the user, wasteful for the mostly-static option lists queries fetch today.
// 60s keeps those reasonably fresh without refetching on every navigation back to a page.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// PWA baseline (reporting-and-polish) — registers the offline-shell service worker.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
