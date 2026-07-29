import { Route, Routes } from 'react-router';
import { LoginPage } from './pages/LoginPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { RequireAuth } from './auth/RequireAuth.tsx';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
