import { ErrorBoundary } from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';
import { CrashScreen } from './components/CrashScreen';
import { initMonitoring } from './lib/monitoring';

initMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Reports the crash (when monitoring is on) and shows a way back instead of a blank page. */}
    <ErrorBoundary fallback={<CrashScreen />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
