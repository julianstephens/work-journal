import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

function sanitizeActionLabel(value: string, source: 'explicit' | 'aria' | 'title' | 'text'): string {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
        return '';
    }

    const withoutQuestionPrefix = trimmed.includes('?')
        ? trimmed.split('?').pop()?.trim() ?? trimmed
        : trimmed;

    const withoutDynamicSuffix = withoutQuestionPrefix
        .replace(/^(add child task) to .+$/i, '$1')
        .replace(/^(open note)[:\s-]+.+$/i, '$1')
        .replace(/^(open task)[:\s-]+.+$/i, '$1');

    const normalized = withoutDynamicSuffix.replace(/[:]\s*$/, '').trim();
    if (source === 'explicit') {
        return normalized;
    }

    const lower = normalized.toLowerCase();
    const verbs = [
        'add', 'create', 'save', 'cancel', 'remove', 'edit', 'preview', 'capture', 'new',
        'log', 'open', 'close', 'expand', 'collapse', 'move', 'toggle', 'confirm', 'apply',
        'indent', 'outdent',
        'back', 'go', 'mark', 'switch',
    ];
    const hasActionVerb = verbs.some((verb) => lower.startsWith(`${verb} `) || lower === verb);

    if (hasActionVerb) {
        return normalized;
    }

    if (source === 'text') {
        return 'Open item';
    }

    return normalized;
}

function getTooltipLabel(anchor: Element | null): string {
    if (!anchor || !(anchor instanceof HTMLElement)) {
        return '';
    }

    const explicit = anchor.getAttribute('data-tooltip-content');
    if (explicit) {
        return sanitizeActionLabel(explicit, 'explicit');
    }

    const ariaLabel = anchor.getAttribute('aria-label');
    if (ariaLabel) {
        return sanitizeActionLabel(ariaLabel, 'aria');
    }

    const title = anchor.getAttribute('title');
    if (title) {
        return sanitizeActionLabel(title, 'title');
    }

    const text = anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const action = sanitizeActionLabel(text, 'text');
    if (action) {
        return action;
    }

    if (anchor.getAttribute('type') === 'submit') {
        return 'Submit';
    }

    return 'Action';
}

export function AppTooltip() {
    return (
        <Tooltip
            id='app-button-tooltip'
            anchorSelect='button'
            opacity={1}
            place='top'
            render={({ activeAnchor }) => {
                const isExplicitlyIncluded = activeAnchor?.closest('[data-tooltip-scope="include"]') !== null;
                if (!isExplicitlyIncluded && activeAnchor?.closest('[data-tooltip-scope="exclude"]')) {
                    return null;
                }

                if (activeAnchor?.getAttribute('data-tooltip-disabled') === 'true') {
                    return null;
                }

                const label = getTooltipLabel(activeAnchor);
                return label || null;
            }}
        />
    );
}