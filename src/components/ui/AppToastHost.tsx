import { Box, CloseButton, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { APP_TOAST_EVENT, type AppToastPayload } from '../../lib/app-toast';

type AppToastItem = AppToastPayload & {
    id: string;
};

const toneStyles = {
    success: {
        bg: 'green.50',
        borderColor: 'green.200',
        titleColor: 'green.800',
        bodyColor: 'green.700',
    },
    error: {
        bg: 'red.50',
        borderColor: 'red.200',
        titleColor: 'red.800',
        bodyColor: 'red.700',
    },
    info: {
        bg: 'blue.50',
        borderColor: 'blue.200',
        titleColor: 'blue.800',
        bodyColor: 'blue.700',
    },
} as const;

export function AppToastHost() {
    const [toasts, setToasts] = useState<AppToastItem[]>([]);

    useEffect(() => {
        const onToast = (event: Event) => {
            const customEvent = event as CustomEvent<AppToastPayload>;
            const payload = customEvent.detail;
            if (!payload?.title) return;

            const item: AppToastItem = {
                ...payload,
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            };

            setToasts((current) => [...current, item]);
        };

        window.addEventListener(APP_TOAST_EVENT, onToast as EventListener);
        return () => window.removeEventListener(APP_TOAST_EVENT, onToast as EventListener);
    }, []);

    useEffect(() => {
        const timers = toasts.map((toast) => window.setTimeout(() => {
            setToasts((current) => current.filter((item) => item.id !== toast.id));
        }, toast.durationMs ?? 2600));

        return () => timers.forEach((timer) => window.clearTimeout(timer));
    }, [toasts]);

    if (toasts.length === 0) return null;

    return (
        <Stack position='fixed' top={4} right={4} zIndex={1500} gap={2} pointerEvents='none' maxW='320px'>
            {toasts.map((toast) => {
                const tone = toneStyles[toast.tone ?? 'info'];
                return (
                    <Box
                        key={toast.id}
                        pointerEvents='auto'
                        border='1px solid'
                        borderColor={tone.borderColor}
                        bg={tone.bg}
                        borderRadius='10px'
                        px={3}
                        py={2.5}
                        boxShadow='sm'
                    >
                        <Box display='flex' alignItems='flex-start' justifyContent='space-between' gap={2}>
                            <Box>
                                <Text fontSize='sm' fontWeight='700' color={tone.titleColor}>{toast.title}</Text>
                                {toast.description ? (
                                    <Text mt={0.5} fontSize='xs' color={tone.bodyColor}>{toast.description}</Text>
                                ) : null}
                            </Box>
                            <CloseButton
                                size='sm'
                                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                            />
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}