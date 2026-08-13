import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { applyDirection } from './utils/direction';
import { I18nProvider, makeT, readStoredLang, DIR_FOR_LANG } from './i18n';

// Resolve direction before the first render so there is no flash of the wrong
// direction. The cached language is only a first-paint hint; /api/me remains
// the source of truth and reconciles once it answers.
const initialLang = readStoredLang();
const { t: bootT } = makeT(initialLang);
applyDirection(DIR_FOR_LANG[initialLang]);

// window.__DEMO__ is injected by the server at GET /demo.
// As a belt-and-suspenders fallback, also detect it from the URL so that
// even if the script injection fails the client enters demo mode correctly.
const demoMode = !!window.__DEMO__ || window.location.pathname === '/demo';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Last line of defence: without this, any uncaught render error unmounts
        the whole tree and the user sees a blank page with no explanation. */}
    <ErrorBoundary label={bootT('app.productName')}>
      <I18nProvider lang={initialLang}>
        <App demoMode={demoMode} />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
