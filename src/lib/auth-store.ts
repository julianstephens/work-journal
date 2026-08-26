import { BaseAuthStore, type AuthRecord } from 'pocketbase';

export type AuthPersistenceMode = 'session' | 'local';

const AUTH_STORAGE_KEY = 'work_journal_auth';
const AUTH_MODE_KEY = 'work_journal_auth_mode';

type StoredAuthState = {
    token?: unknown;
    record?: unknown;
    sessionStartedAt?: unknown;
};

function canUseBrowserStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function asAuthRecord(value: unknown): AuthRecord {
    if (!value || typeof value !== 'object') {
        return null;
    }

    return value as AuthRecord;
}

export class BrowserAuthStore extends BaseAuthStore {
    private readonly storageKey: string;
    private readonly modeKey: string;
    private sessionStartedAt: number | null = null;

    constructor(storageKey = AUTH_STORAGE_KEY, modeKey = AUTH_MODE_KEY) {
        super();
        this.storageKey = storageKey;
        this.modeKey = modeKey;
        this.loadInitialState();
    }

    get mode(): AuthPersistenceMode {
        if (!canUseBrowserStorage()) {
            return 'session';
        }

        const value = window.localStorage.getItem(this.modeKey);
        return value === 'local' ? 'local' : 'session';
    }

    setMode(mode: AuthPersistenceMode): void {
        if (!canUseBrowserStorage()) {
            return;
        }

        window.localStorage.setItem(this.modeKey, mode);
        this.persist(this.token, this.record);
    }

    getSessionStartedAt(): number | null {
        return this.sessionStartedAt;
    }

    setSessionStartedAt(value: number | null): void {
        this.sessionStartedAt = value;
        this.persist(this.token, this.record);
    }

    override save(token: string, record?: AuthRecord): void {
        super.save(token, record);
        this.persist(token, record ?? null);
    }

    override clear(): void {
        super.clear();
        this.sessionStartedAt = null;

        if (!canUseBrowserStorage()) {
            return;
        }

        window.localStorage.removeItem(this.storageKey);
        window.sessionStorage.removeItem(this.storageKey);
    }

    private loadInitialState(): void {
        if (!canUseBrowserStorage()) {
            return;
        }

        const localRaw = window.localStorage.getItem(this.storageKey);
        const sessionRaw = window.sessionStorage.getItem(this.storageKey);
        const mode = this.mode;

        const primaryRaw = mode === 'local' ? localRaw : sessionRaw;
        const fallbackRaw = mode === 'local' ? sessionRaw : localRaw;

        const parsed = this.parse(primaryRaw) ?? this.parse(fallbackRaw);
        if (!parsed) {
            return;
        }

        super.save(parsed.token, parsed.record);
        this.sessionStartedAt = parsed.sessionStartedAt;

        if (this.parse(primaryRaw)) {
            return;
        }

        this.persist(parsed.token, parsed.record);
    }

    private parse(raw: string | null): { token: string; record: AuthRecord; sessionStartedAt: number | null; } | null {
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as StoredAuthState;
            const token = typeof parsed.token === 'string' ? parsed.token : '';
            const record = asAuthRecord(parsed.record);
            const sessionStartedAt = typeof parsed.sessionStartedAt === 'number' && Number.isFinite(parsed.sessionStartedAt)
                ? parsed.sessionStartedAt
                : null;

            if (!token) {
                return null;
            }

            return { token, record, sessionStartedAt };
        } catch {
            return null;
        }
    }

    private persist(token: string, record: AuthRecord): void {
        if (!canUseBrowserStorage()) {
            return;
        }

        const payload = JSON.stringify({
            token,
            record,
            sessionStartedAt: this.sessionStartedAt,
        });
        if (this.mode === 'local') {
            window.localStorage.setItem(this.storageKey, payload);
            window.sessionStorage.removeItem(this.storageKey);
            return;
        }

        window.sessionStorage.setItem(this.storageKey, payload);
        window.localStorage.removeItem(this.storageKey);
    }
}

const authStore = new BrowserAuthStore();

export function setAuthPersistenceMode(mode: AuthPersistenceMode): void {
    authStore.setMode(mode);
}

export function setAuthSessionStartedAt(value: number | null): void {
    authStore.setSessionStartedAt(value);
}

export function getAuthSessionStartedAt(): number | null {
    return authStore.getSessionStartedAt();
}

export { authStore };
