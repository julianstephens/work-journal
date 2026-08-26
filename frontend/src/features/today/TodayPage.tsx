import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { createTask, toggleTaskCompletion } from '../tasks/api';
import { addTaskToToday, listToday, removeTaskFromToday } from './api';

function getLocalIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function TodayPage() {
    const queryClient = useQueryClient();
    const [quickAdd, setQuickAdd] = useState('');
    const todayDate = useMemo(() => getLocalIsoDate(), []);

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
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Flex align='center' justify='space-between' gap={4}>
                <Box>
                    <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>My day</Heading>
                </Box>
                <Box>
                    <Text color='var(--text-muted)' mt={2} fontSize='xl'>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                </Box>
                {/* <Button variant='outline' bg='var(--panel-bg)' borderColor='var(--control-border)' color='var(--app-text)' _hover={{ bg: 'var(--panel-bg-soft)', borderColor: 'var(--text-muted)' }} borderRadius='8px'>
                    <CalendarDays size={16} />
                    <Box as='span' ml={2}>This week</Box>
                </Button> */}
            </Flex>

            <form onSubmit={handleSubmit}>
                <Flex align='center' gap={3} border='1px solid' borderColor='var(--control-border)' borderRadius='10px' px={3} py={2} bg='var(--panel-bg)'>
                    <Plus size={19} color='var(--accent)' />
                    <Input
                        value={quickAdd}
                        onChange={(event) => setQuickAdd(event.target.value)}
                        placeholder='Add a task to My day'
                        flex='1'
                        border='none'
                        _focus={{ boxShadow: 'none' }}
                        bg='transparent'
                        color='var(--control-text)'
                        borderColor='var(--control-border)'
                    />
                    <Button type='submit' size='sm' bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} borderRadius='7px' loading={quickAddMutation.isPending}>
                        Add task
                    </Button>
                </Flex>
            </form>

            <Box>
                <Flex align='center' gap={2} mb={3}>
                    <Sparkles size={16} color='var(--accent)' />
                    <Text fontSize='sm' fontWeight='700' color='var(--text-soft)'>FOCUS FOR TODAY</Text>
                    {!isLoading && todayTasks.length > 0 ? <Text fontSize='sm' color='var(--text-muted)'>· {todayTasks.filter(({ task }) => !task.completed).length} remaining</Text> : null}
                </Flex>
                {isLoading ? (
                    <Text color='var(--text-muted)'>Loading today…</Text>
                ) : todayTasks.length === 0 ? (
                    <Box border='1px dashed' borderColor='var(--control-border)' borderRadius='10px' p={8} textAlign='center'>
                        <Text fontWeight='600'>A clear day ahead.</Text>
                        <Text color='var(--text-muted)' mt={1}>Add a task above to start your list.</Text>
                    </Box>
                ) : (
                    <List.Root as='ul' gap={0} listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 350px)' }} overflowY='auto' pr={1}>
                        {todayTasks.map((item) => (
                            <List.Item key={item.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                <Flex align='center' gap={3} py={4} px={2} _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                    <Button
                                        type='button'
                                        aria-label={item.task.completed ? 'Mark as not done' : 'Mark as done'}
                                        onClick={() => toggleMutation.mutate({ taskId: item.task.id, checked: !item.task.completed })}
                                        variant='outline'
                                        size='sm'
                                        color={item.task.completed ? 'white' : 'var(--text-muted)'}
                                        bg={item.task.completed ? 'var(--accent)' : 'transparent'}
                                        borderColor={item.task.completed ? 'var(--accent)' : 'var(--text-muted)'}
                                        minW='20px'
                                        w='20px'
                                        h='20px'
                                        p={0}
                                        borderRadius='6px'
                                    >{item.task.completed ? <Check size={14} /> : null}</Button>
                                    <Text fontSize='md' textDecoration={item.task.completed ? 'line-through' : 'none'} color={item.task.completed ? 'var(--text-muted)' : 'var(--app-text)'} flex='1'>
                                        {item.task.title}
                                    </Text>
                                    <Button type='button' size='xs' variant='ghost' color='var(--text-muted)' onClick={() => removeMutation.mutate(item.id)}>
                                        Remove
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

export default TodayPage;
