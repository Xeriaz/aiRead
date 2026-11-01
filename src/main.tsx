import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Initialize theme before React renders to avoid theme flash while respecting strict CSP
try {
  const saved = localStorage.getItem('aiRead_theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  const meta = document.getElementById('theme-color-meta');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#09090b' : '#f8fafc');
  }
} catch {
  // Ignore localStorage access errors
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
