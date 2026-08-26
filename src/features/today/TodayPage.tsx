import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/auth-context';
import { TaskFilters } from '../../components/tasks/TaskFilters';
import { buildFilteredTaskRows, DEFAULT_TASK_FILTER_STATE, isTaskFiltersActive, type TaskProjectOption, useTaskFiltersStorage } from '../../components/tasks/task-filtering';
import { ActionStatus } from '../../components/ui/ActionStatus';
import { EmptyCtaCard, LoadingSkeletonRows, SyncFailedBanner } from '../../components/ui/AsyncState';
import type { ActionFeedback } from '../../lib/action-feedback';
import { getActionErrorMessage } from '../../lib/action-feedback';
import { queryKeys } from '../../lib/query-keys';
import { useProjects } from '../projects/useProjects';
import { createTask, deleteTask, toggleTaskCompletion, updateTask } from '../tasks/api';
import { buildTaskRows } from '../tasks/tree';
import { addTaskToToday, listToday, removeTaskFromToday } from './api';

const CREATED_OVERLAY_MS = 1200;
const COMPLETED_OVERLAY_MS = 1200;

const createdOverlayFade = keyframes`
    0% { opacity: 0; }
    14% { opacity: 1; }
    86% { opacity: 1; }
    100% { opacity: 0; }
`;

const createdBadgePop = keyframes`
    0% { opacity: 0; transform: scale(0.82) translateY(4px); }
    22% { opacity: 1; transform: scale(1) translateY(0); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
`;

function getLocalIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function TodayPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const projectsQuery = useProjects();
    const [quickAdd, setQuickAdd] = useState('');
    const [childParentId, setChildParentId] = useState<string | null>(null);
    const [childTitle, setChildTitle] = useState('');
    const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [draftTaskTitle, setDraftTaskTitle] = useState('');
    const [recentlyCreatedIds, setRecentlyCreatedIds] = useState<Record<string, true>>({});
    const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<Record<string, true>>({});
    const createdTimersRef = useRef<Record<string, number>>({});
    const completedTimersRef = useRef<Record<string, number>>({});
    const todayDate = useMemo(() => getLocalIsoDate(), []);
    const [taskFilters, setTaskFilters] = useTaskFiltersStorage('ui.task-filters.today', user?.id);
    const projectOptions = useMemo<TaskProjectOption[]>(() => {
        return [...(projectsQuery.data ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => ({ id: project.id, label: project.name }));
    }, [projectsQuery.data]);

    const {
        data: todayTasks = [],
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });
    const allTodayRows = useMemo(() => buildTaskRows(todayTasks.map((item) => item.task)), [todayTasks]);
    const filteredView = useMemo(() => buildFilteredTaskRows(todayTasks.map((item) => item.task), taskFilters), [todayTasks, taskFilters]);
    const todayByTaskId = useMemo(() => new Map(todayTasks.map((item) => [item.task.id, item])), [todayTasks]);
    const orderedTodayItems = useMemo(
        () => filteredView.rows.map((row) => ({ row, item: todayByTaskId.get(row.task.id) })).filter((entry) => Boolean(entry.item)),
        [filteredView.rows, todayByTaskId],
    );
    const hasTaskFilters = isTaskFiltersActive(taskFilters);
    const hasTodayResults = filteredView.matchingCount > 0;

    useEffect(() => {
        const createdTimers = createdTimersRef.current;
        const completedTimers = completedTimersRef.current;

        return () => {
            Object.values(createdTimers).forEach((timer) => window.clearTimeout(timer));
            Object.values(completedTimers).forEach((timer) => window.clearTimeout(timer));
        };
    }, []);

    const markTaskCreated = (taskId: string) => {
        setRecentlyCreatedIds((current) => ({ ...current, [taskId]: true }));

        const existingTimer = createdTimersRef.current[taskId];
        if (existingTimer) window.clearTimeout(existingTimer);

        createdTimersRef.current[taskId] = window.setTimeout(() => {
            setRecentlyCreatedIds((current) => {
                if (!current[taskId]) return current;
                const next = { ...current };
                delete next[taskId];
                return next;
            });
            delete createdTimersRef.current[taskId];
        }, CREATED_OVERLAY_MS);
    };

    const markTaskCompleted = (taskId: string) => {
        setRecentlyCompletedIds((current) => ({ ...current, [taskId]: true }));

        const existingTimer = completedTimersRef.current[taskId];
        if (existingTimer) window.clearTimeout(existingTimer);

        completedTimersRef.current[taskId] = window.setTimeout(() => {
            setRecentlyCompletedIds((current) => {
                if (!current[taskId]) return current;
                const next = { ...current };
                delete next[taskId];
                return next;
            });
            delete completedTimersRef.current[taskId];
        }, COMPLETED_OVERLAY_MS);
    };

    const quickAddMutation = useMutation({
        mutationFn: async (title: string) => {
            const task = await createTask({ title });
            await addTaskToToday(todayDate, task.id);
            return task;
        },
        onSuccess: (task) => {
            setQuickAdd('');
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            markTaskCreated(task.id);
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not create task.') });
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
        onSuccess: (task, variables) => {
            setChildParentId(null);
            setChildTitle('');
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            if (variables.parentProjectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(variables.parentProjectId) });
            } else {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            }
            markTaskCreated(task.id);
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not create child task.') });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ taskId, checked }: { taskId: string; checked: boolean; }) => toggleTaskCompletion(taskId, checked),
        onMutate: async ({ taskId, checked }) => {
            const todayQueryKey = queryKeys.today.date(todayDate);
            await queryClient.cancelQueries({ queryKey: todayQueryKey });
            const previousToday = queryClient.getQueryData<Awaited<ReturnType<typeof listToday>>>(todayQueryKey) ?? [];
            queryClient.setQueryData(todayQueryKey, previousToday.map((item) => item.task.id === taskId ? {
                ...item,
                task: {
                    ...item.task,
                    completed: checked,
                    completed_at: checked ? new Date().toISOString() : null,
                },
            } : item));
            return { previousToday };
        },
        onSuccess: (_data, variables) => {
            if (variables.checked) {
                markTaskCompleted(variables.taskId);
                return;
            }

            setFeedback({ tone: 'success', message: 'Task marked open.' });
        },
        onError: (error, _variables, context) => {
            if (context?.previousToday) {
                queryClient.setQueryData(queryKeys.today.date(todayDate), context.previousToday);
            }
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not update task status.') });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
    });

    const removeMutation = useMutation({
        mutationFn: removeTaskFromToday,
        onMutate: async (dailyTaskId: string) => {
            const todayQueryKey = queryKeys.today.date(todayDate);
            await queryClient.cancelQueries({ queryKey: todayQueryKey });
            const previousToday = queryClient.getQueryData<Awaited<ReturnType<typeof listToday>>>(todayQueryKey) ?? [];
            queryClient.setQueryData(todayQueryKey, previousToday.filter((item) => item.id !== dailyTaskId));
            return { previousToday };
        },
        onSuccess: () => {
            setFeedback({ tone: 'success', message: 'Removed from My day.' });
        },
        onError: (error, _dailyTaskId, context) => {
            if (context?.previousToday) {
                queryClient.setQueryData(queryKeys.today.date(todayDate), context.previousToday);
            }
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not remove task.') });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
    });

    const renameTaskMutation = useMutation({
        mutationFn: ({ taskId, title }: { taskId: string; title: string; }) => updateTask(taskId, { title }),
        onSuccess: async (_data, variables) => {
            setEditingTaskId(null);
            setDraftTaskTitle('');
            setFeedback({ tone: 'success', message: 'Task renamed.' });
            const task = todayTasks.find((item) => item.task.id === variables.taskId)?.task;
            if (task?.project) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(task.project) });
            } else {
                await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not rename task.') });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async ({ taskId, projectId }: { taskId: string; dailyTaskId: string; projectId: string | null; }) => {
            await deleteTask(taskId);
            return { projectId };
        },
        onMutate: async ({ taskId, dailyTaskId }: { taskId: string; dailyTaskId: string; projectId: string | null; }) => {
            const todayQueryKey = queryKeys.today.date(todayDate);
            await queryClient.cancelQueries({ queryKey: todayQueryKey });
            const previousToday = queryClient.getQueryData<Awaited<ReturnType<typeof listToday>>>(todayQueryKey) ?? [];
            queryClient.setQueryData(todayQueryKey, previousToday.filter((item) => item.id !== dailyTaskId && item.task.id !== taskId));
            return { previousToday };
        },
        onSuccess: (_data, variables) => {
            if (variables.projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(variables.projectId) });
            } else {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            }
        },
        onError: (error, _variables, context) => {
            if (context?.previousToday) {
                queryClient.setQueryData(queryKeys.today.date(todayDate), context.previousToday);
            }
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not delete task.') });
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            if (variables.projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(variables.projectId) });
            } else {
                queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            }
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

    const commitTaskTitle = (taskId: string, currentTitle: string) => {
        const trimmed = draftTaskTitle.trim();
        if (!trimmed || trimmed === currentTitle) {
            setEditingTaskId(null);
            setDraftTaskTitle('');
            return;
        }

        renameTaskMutation.mutate({ taskId, title: trimmed });
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

            <ActionStatus feedback={feedback} onClear={() => setFeedback(null)} />

            <TaskFilters
                value={taskFilters}
                onChange={setTaskFilters}
                projectOptions={projectOptions}
                contextLabel='My day'
                onClearFilters={() => setTaskFilters(DEFAULT_TASK_FILTER_STATE)}
            />

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
                    {hasTaskFilters ? <Text fontSize='sm' color='var(--text-muted)'>· filtered view</Text> : null}
                </Flex>

                {isError ? (
                    <SyncFailedBanner message='Sync failed. Could not load today tasks.' onRetry={() => { void refetch(); }} mb={4} />
                ) : null}

                {isLoading ? (
                    <LoadingSkeletonRows count={4} itemHeight='56px' itemRadius='10px' />
                ) : todayTasks.length === 0 ? (
                    <EmptyCtaCard
                        title='No tasks yet'
                        description='Create your first task to start your day.'
                        actionLabel='Create first task'
                        actionLoading={quickAddMutation.isPending}
                        onAction={() => quickAddMutation.mutate('First task')}
                    />
                ) : !hasTodayResults ? (
                    <EmptyCtaCard
                        title='No tasks match your filters'
                        description='Try a different search, project, or completion filter.'
                        actionLabel='Clear filters'
                        onAction={() => setTaskFilters(DEFAULT_TASK_FILTER_STATE)}
                    />
                ) : (
                    <List.Root as='ul' gap={0} listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 350px)' }} overflowY='auto' pr={1}>
                        {orderedTodayItems.map(({ row, item }) => {
                            if (!item) return null;
                            const childCount = allTodayRows.filter((entry) => entry.parentId === item.task.id).length;
                            const isAddingChild = childParentId === item.task.id;
                            const showCreatedOverlay = Boolean(recentlyCreatedIds[item.task.id]);
                            const showCompletedOverlay = Boolean(recentlyCompletedIds[item.task.id]);
                            const isEditingRow = editingTaskId === item.task.id;
                            const overlayKind = showCreatedOverlay ? 'created' : showCompletedOverlay ? 'completed' : isEditingRow ? 'editing' : null;

                            return (
                                <List.Item key={item.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                    <Box py={4} px={2} pl={`${row.depth * 22 + 8}px`} position='relative' _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                        {overlayKind ? (
                                            <Flex
                                                position='absolute'
                                                inset='0'
                                                align='flex-start'
                                                justify='flex-start'
                                                p={2}
                                                pointerEvents='none'
                                                bg={overlayKind === 'completed' ? 'rgba(34, 197, 94, 0.10)' : overlayKind === 'editing' ? 'rgba(245, 158, 11, 0.10)' : 'rgba(53, 99, 233, 0.06)'}
                                                animation={`${createdOverlayFade} ${CREATED_OVERLAY_MS}ms ease-out forwards`}
                                                zIndex={2}
                                            >
                                                <Flex
                                                    align='center'
                                                    gap={1.5}
                                                    px={2.5}
                                                    py={2.5}
                                                    borderRadius='999px'
                                                    border='1px solid'
                                                    borderColor={overlayKind === 'completed' ? 'green.200' : overlayKind === 'editing' ? 'amber.200' : 'green.200'}
                                                    bg='white'
                                                    color={overlayKind === 'completed' ? 'green.700' : overlayKind === 'editing' ? 'amber.700' : 'green.700'}
                                                    boxShadow='sm'
                                                    animation={`${createdBadgePop} ${CREATED_OVERLAY_MS}ms ease-out forwards`}
                                                    aria-label={overlayKind === 'editing' ? 'Task editing' : overlayKind === 'completed' ? 'Task completed' : 'Task created'}
                                                >
                                                    {overlayKind === 'editing' ? <Pencil size={12} /> : <Check size={12} />}
                                                </Flex>
                                            </Flex>
                                        ) : null}
                                        <Flex align='center' gap={3}>
                                            <Button
                                                type='button'
                                                aria-label={item.task.completed ? 'Mark as not done' : 'Mark as done'}
                                                onClick={() => toggleMutation.mutate({ taskId: item.task.id, checked: !item.task.completed })}
                                                disabled={toggleMutation.isPending && toggleMutation.variables?.taskId === item.task.id}
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
                                            {editingTaskId === item.task.id ? (
                                                <Input
                                                    autoFocus
                                                    value={draftTaskTitle}
                                                    onChange={(event) => setDraftTaskTitle(event.target.value)}
                                                    onBlur={() => commitTaskTitle(item.task.id, item.task.title)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            commitTaskTitle(item.task.id, item.task.title);
                                                        }

                                                        if (event.key === 'Escape') {
                                                            setEditingTaskId(null);
                                                            setDraftTaskTitle('');
                                                        }
                                                    }}
                                                    flex='1'
                                                    bg='var(--control-bg)'
                                                    color='var(--control-text)'
                                                    borderColor='var(--control-border)'
                                                />
                                            ) : (
                                                <Text fontSize='md' textDecoration={item.task.completed ? 'line-through' : 'none'} color={item.task.completed ? 'var(--text-muted)' : 'var(--app-text)'} flex='1'>
                                                    {item.task.title}
                                                </Text>
                                            )}
                                            {row.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                            <Button
                                                type='button'
                                                aria-label={editingTaskId === item.task.id ? 'Save task title' : `Edit task ${item.task.title}`}
                                                title={editingTaskId === item.task.id ? 'Save task title' : 'Edit task title'}
                                                size='xs'
                                                variant='outline'
                                                bg='var(--panel-bg)'
                                                borderColor='var(--control-border)'
                                                color='var(--text-soft)'
                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                onClick={() => {
                                                    if (editingTaskId === item.task.id) {
                                                        commitTaskTitle(item.task.id, item.task.title);
                                                        return;
                                                    }
                                                    setEditingTaskId(item.task.id);
                                                    setDraftTaskTitle(item.task.title);
                                                }}
                                                disabled={renameTaskMutation.isPending && renameTaskMutation.variables?.taskId === item.task.id}
                                                minW='28px'
                                                w='28px'
                                                h='28px'
                                                p={0}
                                            >
                                                {editingTaskId === item.task.id ? <Check size={12} /> : <Pencil size={12} />}
                                            </Button>
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
                                                disabled={childCreateMutation.isPending}
                                                minW='28px'
                                                w='28px'
                                                h='28px'
                                                p={0}
                                            >
                                                <Plus size={12} />
                                            </Button>
                                            <Button
                                                type='button'
                                                aria-label='Remove from today'
                                                title='Remove from today'
                                                size='xs'
                                                variant='outline'
                                                bg='var(--panel-bg)'
                                                borderColor='var(--control-border)'
                                                color='var(--text-soft)'
                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                onClick={() => removeMutation.mutate(item.id)}
                                                loading={removeMutation.isPending && removeMutation.variables === item.id}
                                                disabled={removeMutation.isPending && removeMutation.variables === item.id}
                                                minW='28px'
                                                w='28px'
                                                h='28px'
                                                p={0}
                                            >
                                                <X size={12} />
                                            </Button>
                                            <Button
                                                type='button'
                                                aria-label='Delete task'
                                                title='Delete task'
                                                size='xs'
                                                variant='outline'
                                                bg='var(--panel-bg)'
                                                borderColor='red.200'
                                                color='red.600'
                                                _hover={{ bg: 'red.50', color: 'red.700' }}
                                                onClick={() => deleteMutation.mutate({ taskId: item.task.id, dailyTaskId: item.id, projectId: item.task.project })}
                                                loading={deleteMutation.isPending && deleteMutation.variables?.taskId === item.task.id}
                                                disabled={deleteMutation.isPending && deleteMutation.variables?.taskId === item.task.id}
                                                minW='28px'
                                                w='28px'
                                                h='28px'
                                                p={0}
                                            >
                                                <Trash2 size={12} />
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
                                                    disabled={childCreateMutation.isPending}
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
