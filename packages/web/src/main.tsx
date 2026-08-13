import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext.tsx';
import { ThemeProvider } from './theme/ThemeContext.tsx';
import { routes } from './App.tsx';
// Self-hosted (not a Google Fonts <link>) - no external request at
// runtime, matching this being a self-hosted admin tool, and each
// weight is its own CSS file so only the four this app actually sets
// (400/500/600/700 - see styles/base.css's font-family) get bundled,
// not the full 100-900 range @fontsource/inter ships.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}

const router = createBrowserRouter(routes);

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
