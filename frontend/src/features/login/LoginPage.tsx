import { Button, Field, Input, Stack, Text, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth-context';

function LoginPage() {
    const navigate = useNavigate();
    const { isAuthenticated, login, register, isLoading } = useAuth();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (isAuthenticated) {
        return <Navigate to='/today' replace />;
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (mode === 'signup' && password !== passwordConfirm) {
            setError('Passwords do not match.');
            return;
        }

        try {
            if (mode === 'signin') {
                await login(email, password);
            } else {
                await register(email, username, password);
            }

            navigate('/today');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Authentication failed.';
            setError(message);
        }
    };

    return (
        <Stack align='center' justify='center' minH='100vh' bg='var(--app-bg)'>
            <form
                onSubmit={handleSubmit}
                style={{
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '12px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                    width: '420px',
                    maxWidth: '90vw',
                    padding: '32px',
                }}
            >
                <VStack gap={5}>
                    <Stack gap={1} textAlign='center'>
                        <Text fontSize='2xl' fontWeight='semibold'>
                            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                        </Text>
                        <Text color='var(--text-muted)'>
                            {mode === 'signin'
                                ? 'Sign in to continue to Work Journal.'
                                : 'Sign up to start using Work Journal.'}
                        </Text>
                    </Stack>

                    {error ? <Text color='red.500'>{error}</Text> : null}

                    <Field.Root w='full'>
                        <Field.Label>Email</Field.Label>
                        <Input
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder='name@example.com'
                            bg='var(--control-bg)'
                            color='var(--control-text)'
                            borderColor='var(--control-border)'
                        />
                    </Field.Root>

                    {mode === 'signup' ? (
                        <Field.Root w='full'>
                            <Field.Label>Username</Field.Label>
                            <Input
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder='your-handle'
                                bg='var(--control-bg)'
                                color='var(--control-text)'
                                borderColor='var(--control-border)'
                                required
                            />
                        </Field.Root>
                    ) : null}

                    <Field.Root w='full'>
                        <Field.Label>Password</Field.Label>
                        <Input
                            type='password'
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder='••••••••'
                            bg='var(--control-bg)'
                            color='var(--control-text)'
                            borderColor='var(--control-border)'
                            required
                        />
                    </Field.Root>

                    {mode === 'signup' ? (
                        <Field.Root w='full'>
                            <Field.Label>Confirm password</Field.Label>
                            <Input
                                type='password'
                                value={passwordConfirm}
                                onChange={(event) => setPasswordConfirm(event.target.value)}
                                placeholder='••••••••'
                                bg='var(--control-bg)'
                                color='var(--control-text)'
                                borderColor='var(--control-border)'
                                required
                            />
                        </Field.Root>
                    ) : null}

                    <Button type='submit' w='full' colorScheme='gray' loading={isLoading}>
                        {mode === 'signin' ? 'Log in' : 'Create account'}
                    </Button>

                    <Button
                        type='button'
                        variant='ghost'
                        colorScheme='gray'
                        w='full'
                        onClick={() => {
                            setError(null);
                            setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
                        }}
                    >
                        {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
                    </Button>
                </VStack>
            </form>
        </Stack>
    );
}

export default LoginPage;
