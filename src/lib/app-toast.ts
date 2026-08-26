export type AppToastTone = 'success' | 'error' | 'info';

export type AppToastPayload = {
    title: string;
    description?: string;
    tone?: AppToastTone;
    durationMs?: number;
};

export const APP_TOAST_EVENT = 'work-journal:toast';

export function pushAppToast(payload: AppToastPayload) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<AppToastPayload>(APP_TOAST_EVENT, { detail: payload }));
}