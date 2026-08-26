import { Box, Flex, Input, Stack, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type CommandPaletteItem = {
    id: string;
    label: string;
    keywords?: string[];
    hint?: string;
    run: () => Promise<void> | void;
};

type CommandPaletteProps = {
    onClose: () => void;
    commands: CommandPaletteItem[];
};

export function CommandPalette({ onClose, commands }: CommandPaletteProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    const filteredCommands = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) {
            return commands;
        }

        return commands.filter((command) => {
            const labelMatch = command.label.toLowerCase().includes(term);
            const keywordMatch = command.keywords?.some((keyword) => keyword.toLowerCase().includes(term)) ?? false;
            return labelMatch || keywordMatch;
        });
    }, [commands, query]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        const onKeyDown = async (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) => {
                    if (filteredCommands.length === 0) {
                        return 0;
                    }

                    return (current + 1) % filteredCommands.length;
                });
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => {
                    if (filteredCommands.length === 0) {
                        return 0;
                    }

                    return (current - 1 + filteredCommands.length) % filteredCommands.length;
                });
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                const nextIndex = filteredCommands.length === 0 ? 0 : Math.min(activeIndex, filteredCommands.length - 1);
                const command = filteredCommands[nextIndex];
                if (!command || isRunning) {
                    return;
                }

                setIsRunning(true);
                try {
                    await command.run();
                    onClose();
                } finally {
                    setIsRunning(false);
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeIndex, filteredCommands, isRunning, onClose]);

    const runCommand = async (command: CommandPaletteItem) => {
        if (isRunning) {
            return;
        }

        setIsRunning(true);
        try {
            await command.run();
            onClose();
        } finally {
            setIsRunning(false);
        }
    };

    const activeCommandIndex = filteredCommands.length === 0 ? 0 : Math.min(activeIndex, filteredCommands.length - 1);

    return (
        <Box
            position='fixed'
            inset='0'
            zIndex={1200}
            bg='rgba(0, 0, 0, 0.72)'
            backdropFilter='blur(2px)'
            onClick={onClose}
        >
            <Box
                maxW='720px'
                w='min(92vw, 720px)'
                maxH='calc(100vh - 2rem)'
                mt={{ base: '10vh', md: '14vh' }}
                mx='auto'
                bg='var(--panel-bg)'
                border='1px solid'
                borderColor='var(--panel-border)'
                borderRadius='2xl'
                overflow='hidden'
                boxShadow='0 26px 60px rgba(0, 0, 0, 0.55)'
                display='flex'
                flexDirection='column'
                onClick={(event) => event.stopPropagation()}
            >
                <Input
                    ref={inputRef}
                    placeholder='Type a command...'
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    border='0'
                    borderBottom='1px solid'
                    borderColor='var(--panel-border)'
                    borderRadius='0'
                    bg='transparent'
                    color='var(--app-text)'
                    px={5}
                    py={7}
                    fontSize='lg'
                    _focusVisible={{ boxShadow: 'none' }}
                />

                <Stack gap={0} flex='1' minH={0} overflowY='auto' p={2}>
                    {filteredCommands.length === 0 ? (
                        <Text px={4} py={4} color='var(--text-muted)'>
                            No matching commands.
                        </Text>
                    ) : (
                        filteredCommands.map((command, index) => (
                            <Flex
                                key={command.id}
                                align='center'
                                justify='space-between'
                                px={4}
                                py={3}
                                borderRadius='lg'
                                cursor='pointer'
                                bg={index === activeCommandIndex ? 'var(--accent-muted)' : 'transparent'}
                                color={index === activeCommandIndex ? 'var(--app-text)' : 'var(--text-soft)'}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => runCommand(command)}
                            >
                                <Text fontWeight='medium'>{command.label}</Text>
                                {command.hint ? <Text color='var(--text-muted)' fontSize='sm'>{command.hint}</Text> : null}
                            </Flex>
                        ))
                    )}
                </Stack>

            </Box>
        </Box>
    );
}
