import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Inbox as InboxIcon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { createTask, listInboxTasks, toggleTaskCompletion } from '../tasks/api';
import { addTaskToToday, listToday, removeTaskFromToday } from '../today/api';

function getLocalIsoDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

function InboxPage() {
    const queryClient = useQueryClient();
    const [capture, setCapture] = useState('');
    const todayDate = getLocalIsoDate();

    const { data: inboxItems = [], isLoading } = useQuery({
        queryKey: queryKeys.tasks.inbox(),
        queryFn: listInboxTasks,
    });
    const { data: todayItems = [] } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });
    const dailyTaskIds = useMemo(() => new Map(todayItems.map((item) => [item.task.id, item.id])), [todayItems]);

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

    const addToTodayMutation = useMutation({
        mutationFn: (taskId: string) => addTaskToToday(todayDate, taskId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) }),
    });

    const removeFromTodayMutation = useMutation({
        mutationFn: removeTaskFromToday,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) }),
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const title = capture.trim();
        if (!title) return;
        createMutation.mutate({ title, project: null, parent: null });
    };

    return (
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Box>
                <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>Inbox</Heading>
                <Text color='var(--text-muted)' mt={2}>Capture now, organize when you’re ready.</Text>
            </Box>

            <form onSubmit={handleSubmit}>
                <Flex align='center' gap={3} border='1px solid' borderColor='var(--control-border)' borderRadius='10px' px={3} py={2} bg='var(--panel-bg)'>
                    <Plus size={19} color='var(--accent)' />
                    <Input
                        value={capture}
                        onChange={(event) => setCapture(event.target.value)}
                        placeholder='Capture a task'
                        flex='1'
                        border='none'
                        _focus={{ boxShadow: 'none' }}
                        bg='transparent'
                        color='var(--control-text)'
                        borderColor='var(--control-border)'
                    />
                    <Button type='submit' bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} borderRadius='7px' loading={createMutation.isPending}>
                        Capture
                    </Button>
                </Flex>
            </form>

            <Box>
                {isLoading ? (
                    <Text color='var(--text-muted)'>Loading inbox…</Text>
                ) : inboxItems.length === 0 ? (
                    <Flex direction='column' align='center' py={12} border='1px dashed' borderColor='var(--control-border)' borderRadius='10px'>
                        <InboxIcon size={24} color='var(--text-muted)' />
                        <Text fontWeight='600' mt={3}>Your inbox is clear.</Text>
                        <Text color='var(--text-muted)' mt={1}>New ideas and tasks will land here.</Text>
                    </Flex>
                ) : (
                    <List.Root as='ul' gap={0} listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 350px)' }} overflowY='auto' pr={1}>
                        {inboxItems.map((item) => (
                            <List.Item key={item.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                <Flex align='center' gap={3} py={4} px={2} _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                    <Button
                                        type='button'
                                        aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
                                        onClick={() => toggleMutation.mutate({ taskId: item.id, checked: !item.completed })}
                                        variant='outline'
                                        size='sm'
                                        color={item.completed ? 'white' : 'var(--text-muted)'}
                                        bg={item.completed ? 'var(--accent)' : 'transparent'}
                                        borderColor={item.completed ? 'var(--accent)' : 'var(--text-muted)'}
                                        minW='20px'
                                        w='20px'
                                        h='20px'
                                        p={0}
                                        borderRadius='6px'
                                    >{item.completed ? <Check size={14} /> : null}</Button>
                                    <Text flex='1' textDecoration={item.completed ? 'line-through' : 'none'} color={item.completed ? 'var(--text-muted)' : 'var(--app-text)'}>
                                        {item.title}
                                    </Text>
                                    <Button
                                        type='button'
                                        size='xs'
                                        variant='outline'
                                        borderColor='var(--control-border)'
                                        color='var(--text-soft)'
                                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                        loading={addToTodayMutation.isPending && addToTodayMutation.variables === item.id || removeFromTodayMutation.isPending && removeFromTodayMutation.variables === dailyTaskIds.get(item.id)}
                                        onClick={() => {
                                            const dailyTaskId = dailyTaskIds.get(item.id);
                                            if (dailyTaskId) removeFromTodayMutation.mutate(dailyTaskId);
                                            else addToTodayMutation.mutate(item.id);
                                        }}
                                    >
                                        <CalendarPlus size={13} />
                                        <Box as='span' ml={1}>{dailyTaskIds.has(item.id) ? 'Remove from My day' : 'My day'}</Box>
                                    </Button>
                                </Flex>
                            </List.Item>
                        ))}
                    </List.Root>
                )}
            </Box>

        </Stack>
    );
}

export default InboxPage;
