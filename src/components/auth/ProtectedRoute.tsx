import { Center, Spinner } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/auth-context';

export function ProtectedRoute({ children }: { children: ReactNode; }) {
    const { isAuthenticated, isLoading, authRedirectReason } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <Center minH='100vh'>
                <Spinner size='lg' />
            </Center>
        );
    }

    if (!isAuthenticated) {
        return (
            <Navigate
                to='/login'
                replace
                state={{
                    from: `${location.pathname}${location.search}${location.hash}`,
                    reason: authRedirectReason,
                }}
            />
        );
    }

    return <>{children}</>;
}
