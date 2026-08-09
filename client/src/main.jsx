import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import ErrorBoundary from './components/ui/ErrorBoundary';

// window.__DEMO__ is injected by the server at GET /demo.
// As a belt-and-suspenders fallback, also detect it from the URL so that
// even if the script injection fails the client enters demo mode correctly.
const demoMode = !!window.__DEMO__ || window.location.pathname === '/demo';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Last line of defence: without this, any uncaught render error unmounts
        the whole tree and the user sees a blank page with no explanation. */}
    <ErrorBoundary label="Production Hub">
      <App demoMode={demoMode} />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
