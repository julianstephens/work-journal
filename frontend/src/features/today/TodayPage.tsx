import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { createTask, toggleTaskCompletion } from '../tasks/api';
import { buildTaskRows } from '../tasks/tree';
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
    const [childParentId, setChildParentId] = useState<string | null>(null);
    const [childTitle, setChildTitle] = useState('');
    const todayDate = useMemo(() => getLocalIsoDate(), []);

    const { data: todayTasks = [], isLoading } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });
    const taskRows = useMemo(() => buildTaskRows(todayTasks.map((item) => item.task)), [todayTasks]);
    const todayByTaskId = useMemo(() => new Map(todayTasks.map((item) => [item.task.id, item])), [todayTasks]);
    const orderedTodayItems = useMemo(
        () => taskRows.map((row) => ({ row, item: todayByTaskId.get(row.task.id) })).filter((entry) => Boolean(entry.item)),
        [taskRows, todayByTaskId],
    );

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

    const childCreateMutation = useMutation({
        mutationFn: async ({ title, parentTaskId, parentProjectId, position }: { title: string; parentTaskId: string; parentProjectId: string | null; position: number; }) => {
            const task = await createTask({
                title,
                project: parentProjectId,
                parent: parentTaskId,
                position,
            });
            await addTaskToToday(todayDate, task.id);
            return task;
        },
        onSuccess: (_task, variables) => {
            setChildParentId(null);
            setChildTitle('');
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            if (variables.parentProjectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(variables.parentProjectId) });
            } else {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            }
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

    const openChildEditor = (parentTaskId: string) => {
        if (childParentId === parentTaskId) {
            setChildParentId(null);
            setChildTitle('');
            return;
        }

        setChildParentId(parentTaskId);
        setChildTitle('');
    };

    const submitChildTask = (input: { parentTaskId: string; parentProjectId: string | null; position: number; }) => {
        const title = childTitle.trim();
        if (!title) return;
        childCreateMutation.mutate({
            title,
            parentTaskId: input.parentTaskId,
            parentProjectId: input.parentProjectId,
            position: input.position,
        });
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
                        {orderedTodayItems.map(({ row, item }) => {
                            if (!item) return null;
                            const childCount = taskRows.filter((entry) => entry.parentId === item.task.id).length;
                            const isAddingChild = childParentId === item.task.id;

                            return (
                                <List.Item key={item.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                    <Box py={4} px={2} pl={`${row.depth * 22 + 8}px`} _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                        <Flex align='center' gap={3}>
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
                                            {row.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                            <Button
                                                type='button'
                                                aria-label={`Add child task to ${item.task.title}`}
                                                size='xs'
                                                variant='outline'
                                                bg='var(--panel-bg)'
                                                borderColor='var(--control-border)'
                                                color='var(--text-soft)'
                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                onClick={() => openChildEditor(item.task.id)}
                                                minW='28px'
                                                w='28px'
                                                h='28px'
                                                p={0}
                                            >
                                                <Plus size={12} />
                                            </Button>
                                            <Button
                                                type='button'
                                                size='xs'
                                                variant='outline'
                                                bg='var(--panel-bg)'
                                                borderColor='var(--control-border)'
                                                color='var(--text-soft)'
                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                onClick={() => removeMutation.mutate(item.id)}
                                            >
                                                Remove
                                            </Button>
                                        </Flex>
                                        {isAddingChild ? (
                                            <Flex mt={3} gap={2} align='center' ml={8}>
                                                <Input
                                                    autoFocus
                                                    value={childTitle}
                                                    onChange={(event) => setChildTitle(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            submitChildTask({
                                                                parentTaskId: item.task.id,
                                                                parentProjectId: item.task.project,
                                                                position: childCount,
                                                            });
                                                        }

                                                        if (event.key === 'Escape') {
                                                            setChildParentId(null);
                                                            setChildTitle('');
                                                        }
                                                    }}
                                                    placeholder='Add child task'
                                                    bg='var(--control-bg)'
                                                    color='var(--control-text)'
                                                    borderColor='var(--control-border)'
                                                    size='sm'
                                                />
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    bg='var(--accent)'
                                                    color='white'
                                                    _hover={{ bg: 'var(--accent-soft)' }}
                                                    disabled={!childTitle.trim()}
                                                    loading={childCreateMutation.isPending && childParentId === item.task.id}
                                                    onClick={() => submitChildTask({
                                                        parentTaskId: item.task.id,
                                                        parentProjectId: item.task.project,
                                                        position: childCount,
                                                    })}
                                                >
                                                    Add
                                                </Button>
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    bg='var(--panel-bg)'
                                                    border='1px solid'
                                                    borderColor='var(--control-border)'
                                                    color='var(--text-soft)'
                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                    onClick={() => {
                                                        setChildParentId(null);
                                                        setChildTitle('');
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                            </Flex>
                                        ) : null}
                                    </Box>
                                </List.Item>
                            );
                        })}
                    </List.Root>
                )}
            </Box>

        </Stack>
    );
}

export default TodayPage;
