import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppTooltip } from '../components/ui/AppTooltip';
import { queryClient } from './query-client';

export function AppProviders({ children }: { children: ReactNode; }) {
    return (
        <ChakraProvider value={defaultSystem}>
            <QueryClientProvider client={queryClient}>
                {children}
                <AppTooltip />
            </QueryClientProvider>
        </ChakraProvider>
    );
}
