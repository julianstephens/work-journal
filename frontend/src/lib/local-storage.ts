export function makeUserScopedStorageKey(baseKey: string, userId?: string): string {
    const scope = userId?.trim() || 'anonymous';
    return `${baseKey}:${scope}`;
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback;

    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;

    if (raw === 'true') return true;
    if (raw === 'false') return false;

    return fallback;
}

export function writeStoredBoolean(key: string, value: boolean): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, String(value));
}

export function readStoredJson<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;

    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;

    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function writeStoredJson<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
}