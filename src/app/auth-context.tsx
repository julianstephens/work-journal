import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { sanitizeAuthError } from '../lib/auth-errors';
import { getAuthSessionStartedAt, setAuthPersistenceMode, setAuthSessionStartedAt } from '../lib/auth-store';
import { pb } from '../lib/pocketbase';

const SESSION_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const REFRESH_BEFORE_EXPIRY_MS = 60 * 60 * 1000;

function decodeJwtExpiryMs(token: string): number | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
        const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const payload = JSON.parse(window.atob(padded)) as { exp?: unknown; };
        if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
            return null;
        }

        return payload.exp * 1000;
    } catch {
        return null;
    }
}

function shouldRefreshToken(token: string): boolean {
    const expiryMs = decodeJwtExpiryMs(token);
    if (!expiryMs) {
        return true;
    }

    return Date.now() >= expiryMs - REFRESH_BEFORE_EXPIRY_MS;
}

type AuthRecord = {
    id: string;
    email?: string;
    username?: string;
    name?: string;
};

type AuthContextValue = {
    user: AuthRecord | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    authRedirectReason: 'session-expired' | null;
    clearAuthRedirectReason: () => void;
    login: (email: string, password: string, options?: { rememberMe?: boolean; }) => Promise<void>;
    register: (email: string, username: string, password: string, options?: { rememberMe?: boolean; }) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode; }) {
    const [user, setUser] = useState<AuthRecord | null>(() => {
        if (!pb.authStore.isValid) {
            return null;
        }

        return (pb.authStore.record as AuthRecord | null) ?? null;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [authRedirectReason, setAuthRedirectReason] = useState<'session-expired' | null>(null);

    useEffect(() => {
        const clearSession = (reason: 'session-expired' | null = null): void => {
            pb.authStore.clear();
            setAuthSessionStartedAt(null);
            setUser(null);
            setAuthRedirectReason(reason);
        };

        const clearExpiredSession = (): boolean => {
            if (!pb.authStore.isValid) {
                return true;
            }

            const startedAt = getAuthSessionStartedAt();
            if (!startedAt) {
                // Backward compatibility for existing authenticated users before the
                // session-start timestamp existed.
                setAuthSessionStartedAt(Date.now());
                return true;
            }

            if (Date.now() - startedAt <= SESSION_REFRESH_WINDOW_MS) {
                return true;
            }

            clearSession('session-expired');
            return false;
        };

        const syncUser = () => {
            if (!clearExpiredSession()) {
                return;
            }

            if (!pb.authStore.isValid) {
                setUser(null);
                return;
            }

            setUser((pb.authStore.record as AuthRecord | null) ?? null);
        };

        syncUser();
        setIsLoading(false);

        const refreshIfNeeded = async () => {
            if (!pb.authStore.isValid) {
                return;
            }

            if (!clearExpiredSession()) {
                return;
            }

            if (!shouldRefreshToken(pb.authStore.token)) {
                return;
            }

            try {
                await pb.collection('users').authRefresh();
                pb.authStore.save(pb.authStore.token, pb.authStore.record);
                syncUser();
            } catch {
                clearSession('session-expired');
            }
        };

        void refreshIfNeeded();
        const refreshInterval = window.setInterval(() => {
            void refreshIfNeeded();
        }, REFRESH_CHECK_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void refreshIfNeeded();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        const unsubscribe = pb.authStore.onChange(() => {
            syncUser();
        });

        return () => {
            unsubscribe();
            window.clearInterval(refreshInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const login = async (email: string, password: string, options?: { rememberMe?: boolean; }) => {
        setIsLoading(true);
        try {
            await pb.collection('users').authWithPassword(email, password);
            setAuthPersistenceMode(options?.rememberMe ? 'local' : 'session');
            setAuthSessionStartedAt(Date.now());
            pb.authStore.save(pb.authStore.token, pb.authStore.record);
            setUser((pb.authStore.record as AuthRecord | null) ?? null);
            setAuthRedirectReason(null);
        } catch (error) {
            throw sanitizeAuthError(error, 'login');
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (email: string, username: string, password: string, options?: { rememberMe?: boolean; }) => {
        setIsLoading(true);
        try {
            await pb.collection('users').create({
                email,
                username,
                password,
                passwordConfirm: password,
            });

            await pb.collection('users').authWithPassword(email, password);
            setAuthPersistenceMode(options?.rememberMe ? 'local' : 'session');
            setAuthSessionStartedAt(Date.now());
            pb.authStore.save(pb.authStore.token, pb.authStore.record);
            setUser((pb.authStore.record as AuthRecord | null) ?? null);
            setAuthRedirectReason(null);
        } catch (error) {
            throw sanitizeAuthError(error, 'register');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            pb.authStore.clear();
            setAuthSessionStartedAt(null);
            setUser(null);
            setAuthRedirectReason(null);
        } finally {
            setIsLoading(false);
        }
    };

    const clearAuthRedirectReason = () => {
        setAuthRedirectReason(null);
    };

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            isAuthenticated: pb.authStore.isValid && Boolean(user),
            isLoading,
            authRedirectReason,
            clearAuthRedirectReason,
            login,
            register,
            logout,
        }),
        [authRedirectReason, user, isLoading],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }

    return context;
}
