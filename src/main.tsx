import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from './context/AppContext.tsx';
import './index.css';

// Tier-1 Google Maps JS API auth & quota failure detection (Demo Project key safeguard)
declare global {
  interface Window {
    gm_authFailure?: () => void;
    __fyooraQuotaExceeded?: boolean;
  }
}

window.gm_authFailure = () => {
  window.__fyooraQuotaExceeded = true;
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const joined = args.map((a) => String(a ?? '')).join(' ');
  if (
    joined.includes('OverQuotaMapError') ||
    joined.includes('QuotaExceededError') ||
    (joined.includes('quota') && joined.includes('Google Maps'))
  ) {
    window.__fyooraQuotaExceeded = true;
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  origConsoleError(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
