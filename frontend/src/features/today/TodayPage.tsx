import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { createTask, removeTaskFromToday, toggleTaskCompletion } from '../tasks/api';
import { addTaskToToday, listToday } from './api';

function TodayPage() {
    const queryClient = useQueryClient();
    const [quickAdd, setQuickAdd] = useState('');
    const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const { data: todayTasks = [], isLoading } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });

    const quickAddMutation = useMutation({
        mutationFn: async (title: string) => {
            const task = await createTask({ title });
            await addTaskToToday(todayDate, task.id);
            return task;
        },
        onSuccess: () => {
            setQuickAdd('');
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ taskId, checked }: { taskId: string; checked: boolean; }) => toggleTaskCompletion(taskId, checked),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
    });

    const removeMutation = useMutation({
        mutationFn: removeTaskFromToday,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const title = quickAdd.trim();
        if (!title) return;
        quickAddMutation.mutate(title);
    };

    return (
        <Stack gap={6} maxW='980px'>
            <Flex align='center' justify='space-between'>
                <Box>
                    <Text color='var(--text-muted)' fontSize='sm'>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                    <Heading as='h2' size='lg'>Today</Heading>
                </Box>
                <Button variant='outline' colorScheme='gray'>
                    <CalendarDays size={16} />
                    <Box as='span' ml={2}>This week</Box>
                </Button>
            </Flex>

            <Box bg='var(--panel-bg)' border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={5}>
                {isLoading ? (
                    <Text color='var(--text-muted)'>Loading today…</Text>
                ) : todayTasks.length === 0 ? (
                    <Text color='var(--text-muted)'>No tasks scheduled for today yet.</Text>
                ) : (
                    <List.Root as='ul' gap={3} listStyle='none' m='0' p='0'>
                        {todayTasks.map((item) => (
                            <List.Item key={item.id}>
                                <Flex align='center' gap={3} py={2}>
                                    <Button
                                        type='button'
                                        aria-label={item.task.completed ? 'Mark as not done' : 'Mark as done'}
                                        onClick={() => toggleMutation.mutate({ taskId: item.task.id, checked: !item.task.completed })}
                                        variant={item.task.completed ? 'solid' : 'outline'}
                                        size='sm'
                                        colorScheme='gray'
                                        minW='14px'
                                        w='14px'
                                        h='14px'
                                        p={0}
                                        borderRadius='sm'
                                    />
                                    <Text fontSize='md' textDecoration={item.task.completed ? 'line-through' : 'none'} color={item.task.completed ? 'var(--text-muted)' : 'var(--app-text)'} flex='1'>
                                        {item.task.title}
                                    </Text>
                                    <Button type='button' size='xs' variant='ghost' colorScheme='gray' onClick={() => removeMutation.mutate(item.id)}>
                                        Remove
                                    </Button>
                                </Flex>
                            </List.Item>
                        ))}
                    </List.Root>
                )}
            </Box>

            <Box borderTop='1px solid' borderColor='var(--panel-border)' />

            <form onSubmit={handleSubmit}>
                <Flex align='center' justify='space-between' gap={3}>
                    <Text fontSize='sm' color='var(--text-muted)'>Quick capture</Text>
                    <Input
                        value={quickAdd}
                        onChange={(event) => setQuickAdd(event.target.value)}
                        placeholder='Add task for today'
                        w='320px'
                        bg='var(--control-bg)'
                        color='var(--control-text)'
                        borderColor='var(--control-border)'
                    />
                    <Button type='submit' size='sm' variant='ghost' colorScheme='gray' loading={quickAddMutation.isPending}>
                        <Plus size={14} />
                        <Box as='span' ml={2}>Add task</Box>
                    </Button>
                </Flex>
            </form>
        </Stack>
    );
}

export default TodayPage;
