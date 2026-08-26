import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/auth-context';
import { AppProviders } from './app/providers';
import { router } from './app/router';

function App() {
  return (
    <AuthProvider>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AuthProvider>
  );
}

export default App;
