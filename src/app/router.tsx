import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { NotFoundPage, RouteErrorBoundary } from '../components/error/RouteFallback';
import AppShell from '../components/layout/AppShell';
import InboxPage from '../features/inbox/InboxPage';
import LoginPage from '../features/login/LoginPage';
import NotesPage from '../features/notes/NotesPage';
import ProjectDetailPage from '../features/projects/ProjectDetailPage';
import ProjectsPage from '../features/projects/ProjectsPage';
import TodayPage from '../features/today/TodayPage';

export const router = createBrowserRouter([
    {
        path: '/login',
        element: <LoginPage />,
        errorElement: <RouteErrorBoundary />,
    },
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <AppShell />
            </ProtectedRoute>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
            { path: 'today', element: <TodayPage /> },
            { path: 'inbox', element: <InboxPage /> },
            { path: 'notes', element: <NotesPage /> },
            { path: 'projects', element: <ProjectsPage /> },
            { path: 'projects/:projectId', element: <ProjectDetailPage /> },
            { index: true, element: <TodayPage /> },
            { path: '*', element: <NotFoundPage /> },
        ],
    },
    {
        path: '*',
        element: <NotFoundPage />,
        errorElement: <RouteErrorBoundary />,
    },
]);
