import { Button, Center, Heading, Stack, Text } from '@chakra-ui/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    hasError: boolean;
};

export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('App error boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <RouteErrorFallback onPrimaryAction={() => this.setState({ hasError: false })} />;
        }

        return this.props.children;
    }
}

function RouteErrorFallback({ onPrimaryAction }: { onPrimaryAction?: () => void }) {
    const navigate = useNavigate();
    const error = useRouteError();
    const isNotFound = isRouteErrorResponse(error) && error.status === 404;

    const title = isNotFound ? 'Page not found' : 'Something went wrong';
    const detail = isNotFound
        ? 'The page you requested could not be found.'
        : 'An unexpected error occurred while loading this page.'

    return (
        <Center minH='60vh'>
            <Stack align='center' textAlign='center' gap={4}>
                <Heading as='h1' size='lg' letterSpacing='-0.03em'>{title}</Heading>
                <Text color='var(--text-soft)'>{detail}</Text>
                <Stack direction='row' gap={3}>
                    <Button variant='ghost' onClick={() => navigate(-1)}>
                        Go back
                    </Button>
                    <Button
                        onClick={() => {
                            onPrimaryAction?.();
                            navigate('/today');
                        }}
                        bg='var(--accent)'
                        color='white'
                        _hover={{ bg: 'var(--accent-soft)' }}
                    >
                        Back to My day
                    </Button>
                </Stack>
            </Stack>
        </Center>
    );
}

export function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <Center minH='60vh'>
            <Stack align='center' textAlign='center' gap={4}>
                <Heading as='h1' size='lg' letterSpacing='-0.03em'>Page not found</Heading>
                <Text color='var(--text-soft)'>The page you’re looking for doesn’t exist or may have moved.</Text>
                <Button
                    onClick={() => navigate('/today')}
                    bg='var(--accent)'
                    color='white'
                    _hover={{ bg: 'var(--accent-soft)' }}
                >
                    Return to My day
                </Button>
            </Stack>
        </Center>
    );
}

export function RouteErrorBoundary() {
    return <RouteErrorFallback />;
}
