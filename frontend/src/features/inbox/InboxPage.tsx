import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { createTask, listInboxTasks, toggleTaskCompletion } from '../tasks/api';

function InboxPage() {
    const queryClient = useQueryClient();
    const [capture, setCapture] = useState('');

    const { data: inboxItems = [], isLoading } = useQuery({
        queryKey: queryKeys.tasks.inbox(),
        queryFn: listInboxTasks,
    });

    const createMutation = useMutation({
        mutationFn: createTask,
        onSuccess: () => {
            setCapture('');
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ taskId, checked }: { taskId: string; checked: boolean; }) => toggleTaskCompletion(taskId, checked),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
        },
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const title = capture.trim();
        if (!title) return;
        createMutation.mutate({ title, project: null, parent: null });
    };

    return (
        <Stack gap={6} maxW='900px'>
            <Heading as='h2' size='lg'>Inbox</Heading>

            <Box bg='var(--panel-bg)' border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={5}>
                {isLoading ? (
                    <Text color='var(--text-muted)'>Loading inbox…</Text>
                ) : inboxItems.length === 0 ? (
                    <Text color='var(--text-muted)'>No inbox tasks yet.</Text>
                ) : (
                    <List.Root as='ul' gap={3} listStyle='none' m='0' p='0'>
                        {inboxItems.map((item) => (
                            <List.Item key={item.id}>
                                <Flex align='center' gap={3} py={2}>
                                    <Button
                                        type='button'
                                        aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
                                        onClick={() => toggleMutation.mutate({ taskId: item.id, checked: !item.completed })}
                                        variant={item.completed ? 'solid' : 'outline'}
                                        size='sm'
                                        colorScheme='gray'
                                        minW='14px'
                                        w='14px'
                                        h='14px'
                                        p={0}
                                        borderRadius='sm'
                                    />
                                    <Text flex='1' textDecoration={item.completed ? 'line-through' : 'none'} color={item.completed ? 'var(--text-muted)' : 'var(--app-text)'}>
                                        {item.title}
                                    </Text>
                                </Flex>
                            </List.Item>
                        ))}
                    </List.Root>
                )}
            </Box>

            <form onSubmit={handleSubmit}>
                <Flex justify='flex-start' gap={3} align='center'>
                    <Input
                        value={capture}
                        onChange={(event) => setCapture(event.target.value)}
                        placeholder='Capture a task'
                        w='320px'
                        bg='var(--control-bg)'
                        color='var(--control-text)'
                        borderColor='var(--control-border)'
                    />
                    <Button type='submit' variant='outline' colorScheme='gray' loading={createMutation.isPending}>
                        <Plus size={14} />
                        <Box as='span' ml={2}>Capture</Box>
                    </Button>
                </Flex>
            </form>
        </Stack>
    );
}

export default InboxPage;
