import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

// window.__DEMO__ is injected by the server at GET /demo.
// As a belt-and-suspenders fallback, also detect it from the URL so that
// even if the script injection fails the client enters demo mode correctly.
const demoMode = !!window.__DEMO__ || window.location.pathname === '/demo';

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
