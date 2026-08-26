import { Box, Text } from '@chakra-ui/react';
import { useEffect } from 'react';
import type { ActionFeedback } from '../../lib/action-feedback';

type ActionStatusProps = {
    feedback: ActionFeedback | null;
    onClear: () => void;
    autoHideMs?: number;
};

const toneStyles = {
    success: {
        bg: 'green.50',
        borderColor: 'green.200',
        color: 'green.700',
    },
    error: {
        bg: 'red.50',
        borderColor: 'red.200',
        color: 'red.700',
    },
    info: {
        bg: 'blue.50',
        borderColor: 'blue.200',
        color: 'blue.700',
    },
} as const;

export function ActionStatus({ feedback, onClear, autoHideMs = 2600 }: ActionStatusProps) {
    useEffect(() => {
        if (!feedback) return;
        const timer = window.setTimeout(onClear, autoHideMs);
        return () => window.clearTimeout(timer);
    }, [autoHideMs, feedback, onClear]);

    if (!feedback) return null;

    const tone = toneStyles[feedback.tone];

    return (
        <Box border='1px solid' borderColor={tone.borderColor} bg={tone.bg} borderRadius='10px' px={3} py={2}>
            <Text color={tone.color} fontSize='sm' fontWeight='600'>
                {feedback.message}
            </Text>
        </Box>
    );
}