export type ActionTone = 'success' | 'error' | 'info';

export type ActionFeedback = {
    tone: ActionTone;
    message: string;
};

export function getActionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    return fallback;
}