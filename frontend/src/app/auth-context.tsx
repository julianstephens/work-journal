import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { pb } from '../lib/pocketbase';

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
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, username: string, password: string) => Promise<void>;
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

    useEffect(() => {
        const syncUser = () => {
            if (!pb.authStore.isValid) {
                setUser(null);
                return;
            }

            setUser((pb.authStore.record as AuthRecord | null) ?? null);
        };

        syncUser();
        setIsLoading(false);

        return pb.authStore.onChange(() => {
            syncUser();
        });
    }, []);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            await pb.collection('users').authWithPassword(email, password);
            setUser((pb.authStore.record as AuthRecord | null) ?? null);
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (email: string, username: string, password: string) => {
        setIsLoading(true);
        try {
            await pb.collection('users').create({
                email,
                username,
                password,
                passwordConfirm: password,
            });

            await pb.collection('users').authWithPassword(email, password);
            setUser((pb.authStore.record as AuthRecord | null) ?? null);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            pb.authStore.clear();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            isAuthenticated: pb.authStore.isValid && Boolean(user),
            isLoading,
            login,
            register,
            logout,
        }),
        [user, isLoading],
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
