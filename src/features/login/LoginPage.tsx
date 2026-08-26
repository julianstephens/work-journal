import { Button, Field, Input, Stack, Text, VStack } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth-context';

type LoginLocationState = {
    from?: string;
    reason?: 'session-expired' | null;
};

type FieldErrors = {
    email?: string;
    username?: string;
    password?: string;
    passwordConfirm?: string;
};

function isValidRedirectTarget(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, login, register, isLoading, clearAuthRedirectReason } = useAuth();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const usernameInputRef = useRef<HTMLInputElement | null>(null);

    const loginState = (location.state ?? null) as LoginLocationState | null;
    const redirectTarget = useMemo(() => {
        if (isValidRedirectTarget(loginState?.from)) {
            return loginState.from;
        }

        return '/today';
    }, [loginState?.from]);

    const sessionExpiredMessage = loginState?.reason === 'session-expired'
        ? 'Your session expired. Please sign in again.'
        : null;

    useEffect(() => {
        if (loginState?.reason === 'session-expired') {
            clearAuthRedirectReason();
        }
    }, [clearAuthRedirectReason, loginState?.reason]);

    useEffect(() => {
        if (mode === 'signup') {
            usernameInputRef.current?.focus();
            return;
        }

        emailInputRef.current?.focus();
    }, [mode]);

    if (isAuthenticated) {
        return <Navigate to={redirectTarget} replace />;
    }

    const validateForm = (): boolean => {
        const nextErrors: FieldErrors = {};

        if (!email.trim()) {
            nextErrors.email = 'Email is required.';
        } else if (!isValidEmail(email.trim())) {
            nextErrors.email = 'Enter a valid email address.';
        }

        if (!password) {
            nextErrors.password = 'Password is required.';
        } else if (mode === 'signup' && password.length < 8) {
            nextErrors.password = 'Use at least 8 characters.';
        }

        if (mode === 'signup') {
            if (!username.trim()) {
                nextErrors.username = 'Username is required.';
            } else if (username.trim().length < 3) {
                nextErrors.username = 'Use at least 3 characters.';
            }

            if (!passwordConfirm) {
                nextErrors.passwordConfirm = 'Please confirm your password.';
            } else if (password !== passwordConfirm) {
                nextErrors.passwordConfirm = 'Passwords do not match.';
            }
        }

        setFieldErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!validateForm()) {
            return;
        }

        try {
            if (mode === 'signin') {
                await login(email, password, { rememberMe });
            } else {
                await register(email, username, password, { rememberMe });
            }

            navigate(redirectTarget, { replace: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Authentication failed.';
            const normalizedMessage = message.toLowerCase();

            if (mode === 'signin' && normalizedMessage.includes('invalid')) {
                setFieldErrors({ password: 'Invalid email or password.' });
                return;
            }

            if (mode === 'signup' && normalizedMessage.includes('password')) {
                setFieldErrors({ password: message });
                return;
            }

            setError(message);
        } finally {
            setPassword('');
            setPasswordConfirm('');
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

                    {sessionExpiredMessage ? <Text color='orange.500'>{sessionExpiredMessage}</Text> : null}

                    {error ? <Text color='red.500'>{error}</Text> : null}

                    <Field.Root w='full' invalid={Boolean(fieldErrors.email)}>
                        <Field.Label>Email</Field.Label>
                        <Input
                            ref={emailInputRef}
                            name='email'
                            type='email'
                            value={email}
                            onChange={(event) => {
                                setEmail(event.target.value);
                                setFieldErrors((current) => ({ ...current, email: undefined }));
                                setError(null);
                            }}
                            placeholder='name@example.com'
                            bg='var(--control-bg)'
                            color='var(--control-text)'
                            borderColor='var(--control-border)'
                            autoComplete='email'
                            autoCapitalize='none'
                            autoCorrect='off'
                            spellCheck={false}
                            inputMode='email'
                            required
                        />
                        {fieldErrors.email ? <Field.ErrorText>{fieldErrors.email}</Field.ErrorText> : null}
                    </Field.Root>

                    {mode === 'signup' ? (
                        <Field.Root w='full' invalid={Boolean(fieldErrors.username)}>
                            <Field.Label>Username</Field.Label>
                            <Input
                                ref={usernameInputRef}
                                name='username'
                                value={username}
                                onChange={(event) => {
                                    setUsername(event.target.value);
                                    setFieldErrors((current) => ({ ...current, username: undefined }));
                                    setError(null);
                                }}
                                placeholder='your-handle'
                                bg='var(--control-bg)'
                                color='var(--control-text)'
                                borderColor='var(--control-border)'
                                autoComplete='username'
                                autoCapitalize='none'
                                autoCorrect='off'
                                spellCheck={false}
                                required
                            />
                            {fieldErrors.username ? <Field.ErrorText>{fieldErrors.username}</Field.ErrorText> : null}
                        </Field.Root>
                    ) : null}

                    <Field.Root w='full' invalid={Boolean(fieldErrors.password)}>
                        <Field.Label>Password</Field.Label>
                        <Input
                            name='password'
                            type='password'
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                setFieldErrors((current) => ({ ...current, password: undefined }));
                                setError(null);
                            }}
                            placeholder='••••••••'
                            bg='var(--control-bg)'
                            color='var(--control-text)'
                            borderColor='var(--control-border)'
                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                            required
                        />
                        {fieldErrors.password ? <Field.ErrorText>{fieldErrors.password}</Field.ErrorText> : null}
                    </Field.Root>

                    {mode === 'signup' ? (
                        <Field.Root w='full' invalid={Boolean(fieldErrors.passwordConfirm)}>
                            <Field.Label>Confirm password</Field.Label>
                            <Input
                                name='passwordConfirm'
                                type='password'
                                value={passwordConfirm}
                                onChange={(event) => {
                                    setPasswordConfirm(event.target.value);
                                    setFieldErrors((current) => ({ ...current, passwordConfirm: undefined }));
                                    setError(null);
                                }}
                                placeholder='••••••••'
                                bg='var(--control-bg)'
                                color='var(--control-text)'
                                borderColor='var(--control-border)'
                                autoComplete='new-password'
                                required
                            />
                            {fieldErrors.passwordConfirm ? <Field.ErrorText>{fieldErrors.passwordConfirm}</Field.ErrorText> : null}
                        </Field.Root>
                    ) : null}

                    <label
                        style={{
                            alignSelf: 'flex-start',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '0.925rem',
                        }}
                    >
                        <input
                            name='rememberMe'
                            type='checkbox'
                            checked={rememberMe}
                            onChange={(event) => setRememberMe(event.target.checked)}
                        />
                        Remember me on this device
                    </label>

                    <Button type='submit' w='full' bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} loading={isLoading}>
                        {mode === 'signin' ? 'Log in' : 'Create account'}
                    </Button>

                    <Button
                        type='button'
                        variant='ghost'
                        w='full'
                        color='var(--text-soft)'
                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                        onClick={() => {
                            setError(null);
                            setFieldErrors({});
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
