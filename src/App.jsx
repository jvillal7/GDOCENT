import { AppProvider, useApp } from './context/AppContext';
import LoginFlow from './pages/login/LoginFlow';
import AppShell from './components/AppShell';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

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
  return (
    <ErrorBoundary>
      <AppProvider>
        <Inner />
      </AppProvider>
    </ErrorBoundary>
  );
}
