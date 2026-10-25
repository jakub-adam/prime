import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { applyTheme, engine } from './app/store';
import { router } from './app/router';
import { registerSW } from 'virtual:pwa-register';

/* v1 links and the home-screen start_url use '#today'; the router uses '#/today'. */
function upgradeLegacyHash() {
  const m = /^#([a-z].*)$/.exec(location.hash);
  if (m) history.replaceState(null, '', `${location.pathname}${location.search}#/${m[1]}`);
}
upgradeLegacyHash();
window.addEventListener('hashchange', upgradeLegacyHash);

applyTheme();
window.addEventListener('online', () => engine.retryPending());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') engine.onVisible(); });
void engine.load();

if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
