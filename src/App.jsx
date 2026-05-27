import { AppProvider, useApp } from './context/AppContext';
import LoginFlow from './pages/login/LoginFlow';
import AppShell from './components/AppShell';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';

// Detecta el mode superadmin per URL (?superadmin=1)
const IS_SUPERADMIN = new URLSearchParams(window.location.search).has('superadmin');

function Inner() {
  const { role } = useApp();
  return (
    <>
      {!role ? <LoginFlow /> : <AppShell />}
      <Toast />
    </>
  );
}

export default function App() {
  if (IS_SUPERADMIN) return <SuperAdminDashboard />;
  return (
    <ErrorBoundary>
      <AppProvider>
        <Inner />
      </AppProvider>
    </ErrorBoundary>
  );
}
