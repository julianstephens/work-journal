import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/auth-context';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { AppErrorBoundary } from './components/error/RouteFallback';

function App() {
  return (
    <AuthProvider>
      <AppProviders>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </AppProviders>
    </AuthProvider>
  );
}

export default App;
