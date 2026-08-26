import { ClientResponseError } from 'pocketbase';

type AuthAction = 'login' | 'register';

const DEFAULT_AUTH_ERROR = 'Authentication failed. Please try again.';

function readValidationMessage(error: ClientResponseError): string | null {
    const data = error.response?.data;

    if (!data || typeof data !== 'object') {
        return null;
    }

    const fieldErrors = Object.values(data as Record<string, unknown>);
    for (const candidate of fieldErrors) {
        if (!candidate || typeof candidate !== 'object') {
            continue;
        }

        const message = (candidate as Record<string, unknown>).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return null;
}

export function sanitizeAuthError(error: unknown, action: AuthAction): Error {
    if (error instanceof ClientResponseError) {
        if (action === 'login' && (error.status === 400 || error.status === 401)) {
            return new Error('Invalid email or password.');
        }

        const validationMessage = readValidationMessage(error);
        if (validationMessage) {
            return new Error(validationMessage);
        }

        if (error.status === 429) {
            return new Error('Too many attempts. Please wait and try again.');
        }

        return new Error(DEFAULT_AUTH_ERROR);
    }

    if (error instanceof Error && error.message.trim()) {
        return new Error(error.message);
    }

    return new Error(DEFAULT_AUTH_ERROR);
}
