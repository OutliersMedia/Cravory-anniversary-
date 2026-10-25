import React, { Suspense, lazy, useState, useEffect } from 'react';
import { GamePage } from './pages/GamePage.js';

const AdminPage = lazy(() =>
  import('./pages/AdminPage.js').then((module) => ({ default: module.AdminPage }))
);

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (currentPath.startsWith('/admin')) {
    return (
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading Admin Panel...</div>}>
        <AdminPage />
      </Suspense>
    );
  }

  return <GamePage />;
};
