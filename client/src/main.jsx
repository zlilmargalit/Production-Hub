import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

const demoMode = !!window.__DEMO__;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App demoMode={demoMode} />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
