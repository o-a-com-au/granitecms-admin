import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './auth/AuthContext.tsx';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
