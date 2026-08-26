import { Box, Button, Flex, Heading, Input, List, Stack, Text } from '@chakra-ui/react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { keyframes } from '@emotion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/auth-context';
import { TaskFilters } from '../../components/tasks/TaskFilters';
import { buildFilteredTaskRows, DEFAULT_TASK_FILTER_STATE, isTaskFiltersActive, useTaskFiltersStorage, type TaskProjectOption } from '../../components/tasks/task-filtering';
import { ActionStatus } from '../../components/ui/ActionStatus';
import { EmptyCtaCard } from '../../components/ui/AsyncState';
import type { ActionFeedback } from '../../lib/action-feedback';
import { getActionErrorMessage } from '../../lib/action-feedback';
import { queryKeys } from '../../lib/query-keys';
import type { DailyTaskWithTask, Task } from '../../types/pocketbase';
import { useProjects } from '../projects/useProjects';
import { createTask, deleteTask, listAllTasks, toggleTaskCompletion, updateTask } from '../tasks/api';
import {
    buildTaskRows,
    derivePositionChanges,
    moveTaskWithinTree,
    outdentTask,
} from '../tasks/tree';
import { addTaskToToday, listToday, removeTaskFromToday } from '../today/api';

const EMPTY_TASKS: Task[] = [];
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

type PersistInboxTreePayload = {
    changes: Array<{ id: string; parent: string | null; position: number; }>;
    nextTasks: Task[];
};

function DraggableGrip({ taskId }: { taskId: string; }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: taskId });

    return (
        <Button
            ref={setNodeRef}
            type='button'
            variant='ghost'
            size='xs'
            aria-label='Drag task'
            cursor={isDragging ? 'grabbing' : 'grab'}
            color='var(--text-muted)'
            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
            _active={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
            {...listeners}
            {...attributes}
            style={{ transform: CSS.Translate.toString(transform) }}
        >
            <GripVertical size={14} />
        </Button>
    );
}

function DroppableTaskRow({ taskId, depth, children }: { taskId: string; depth: number; children: React.ReactNode; }) {
    const { setNodeRef, isOver } = useDroppable({ id: taskId });

    return (
        <List.Item
            ref={setNodeRef}
            borderBottom='1px solid'
            borderColor='var(--panel-border)'
            bg={isOver ? 'var(--panel-bg-soft)' : 'transparent'}
        >
            <Box pl={`${depth * 22 + 2}px`}>
                {children}
            </Box>
        </List.Item>
    );
}

function getLocalIsoDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

function InboxPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const projectsQuery = useProjects();
    const [capture, setCapture] = useState('');
    const [childParentId, setChildParentId] = useState<string | null>(null);
    const [childTitle, setChildTitle] = useState('');
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [draftTaskTitle, setDraftTaskTitle] = useState('');
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [bulkProjectId, setBulkProjectId] = useState<string>('');
    const [reorderMode, setReorderMode] = useState(false);
    const [recentlyCreatedIds, setRecentlyCreatedIds] = useState<Record<string, true>>({});
    const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<Record<string, true>>({});
    const createdTimersRef = useRef<Record<string, number>>({});
    const completedTimersRef = useRef<Record<string, number>>({});
    const todayDate = getLocalIsoDate();
    const inboxQueryKey = queryKeys.tasks.inbox();
    const [taskFilters, setTaskFilters] = useTaskFiltersStorage('ui.task-filters.inbox', user?.id);
    const inboxCanReorder = taskFilters.sortField === 'manual' && taskFilters.sortDirection === 'asc';
    const projectOptions = useMemo<TaskProjectOption[]>(() => {
        return [...(projectsQuery.data ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => ({ id: project.id, label: project.name }));
    }, [projectsQuery.data]);
    const hasTaskFilters = isTaskFiltersActive(taskFilters);
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8,
        },
    }));

    const { data: inboxItems = EMPTY_TASKS, isLoading } = useQuery({
        queryKey: inboxQueryKey,
        queryFn: listAllTasks,
    });
    const { data: todayItems = [] } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });
    const dailyTaskIds = useMemo(() => new Map(todayItems.map((item) => [item.task.id, item.id])), [todayItems]);
    const allInboxRows = useMemo(() => buildTaskRows(inboxItems), [inboxItems]);
    const filteredView = useMemo(() => buildFilteredTaskRows(inboxItems, taskFilters), [inboxItems, taskFilters]);
    const inboxRows = filteredView.rows;
    const activeDragTask = useMemo(() => {
        if (!activeDragId) return null;
        const row = inboxRows.find((item) => item.task.id === activeDragId);
        return row ?? null;
    }, [activeDragId, inboxRows]);
    const hasInboxResults = filteredView.matchingCount > 0;
    const visibleTaskIds = useMemo(() => inboxRows.map((row) => row.task.id), [inboxRows]);
    const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.includes(id));
    const dragHint = inboxCanReorder ? null : 'Drag and drop is available only when sorted by Manual position ascending.';
    const isReorderModeActive = inboxCanReorder && reorderMode;

    useEffect(() => {
        return () => {
            Object.values(createdTimersRef.current).forEach((timer) => window.clearTimeout(timer));
            Object.values(completedTimersRef.current).forEach((timer) => window.clearTimeout(timer));
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

    const createMutation = useMutation({
        mutationFn: createTask,
        onSuccess: (task) => {
            setCapture('');
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            markTaskCreated(task.id);
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not create task.') });
        },
    });

    const createChildMutation = useMutation({
        mutationFn: ({ title, parentTaskId, position }: { title: string; parentTaskId: string; position: number; }) => createTask({
            title,
            project: null,
            parent: parentTaskId,
            position,
        }),
        onSuccess: (task) => {
            setChildParentId(null);
            setChildTitle('');
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            markTaskCreated(task.id);
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not create child task.') });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ taskId, checked }: { taskId: string; checked: boolean; }) => toggleTaskCompletion(taskId, checked),
        onMutate: async ({ taskId, checked }) => {
            await queryClient.cancelQueries({ queryKey: inboxQueryKey });
            const previous = queryClient.getQueryData<Task[]>(inboxQueryKey) ?? EMPTY_TASKS;
            queryClient.setQueryData(inboxQueryKey, previous.map((task) => task.id === taskId ? {
                ...task,
                completed: checked,
                completed_at: checked ? new Date().toISOString() : null,
            } : task));
            return { previous };
        },
        onSuccess: (_data, variables) => {
            if (variables.checked) {
                markTaskCompleted(variables.taskId);
                return;
            }

            setFeedback({ tone: 'success', message: 'Task marked open.' });
        },
        onError: (error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(inboxQueryKey, context.previous);
            }
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not update task status.') });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
        },
    });

    const persistTreeMutation = useMutation({
        mutationFn: async ({ changes }: PersistInboxTreePayload) => {
            await Promise.all(changes.map((change) => updateTask(change.id, {
                parent: change.parent,
                position: change.position,
            })));
        },
        onMutate: async ({ nextTasks }: PersistInboxTreePayload) => {
            await queryClient.cancelQueries({ queryKey: inboxQueryKey });
            const previous = queryClient.getQueryData<Task[]>(inboxQueryKey) ?? EMPTY_TASKS;
            queryClient.setQueryData(inboxQueryKey, nextTasks);
            return { previous };
        },
        onError: (_error, _vars, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(inboxQueryKey, ctx.previous);
            setFeedback({ tone: 'error', message: 'Could not move task. Try again.' });
        },
        onSuccess: () => {
            setFeedback({ tone: 'success', message: 'Task moved.' });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
        },
    });

    const addToTodayMutation = useMutation({
        mutationFn: (taskId: string) => addTaskToToday(todayDate, taskId),
        onMutate: async (taskId: string) => {
            const todayQueryKey = queryKeys.today.date(todayDate);
            await queryClient.cancelQueries({ queryKey: todayQueryKey });
            const previousToday = queryClient.getQueryData<DailyTaskWithTask[]>(todayQueryKey) ?? [];
            const task = (queryClient.getQueryData<Task[]>(inboxQueryKey) ?? []).find((item) => item.id === taskId);
            if (task && !previousToday.some((item) => item.task.id === taskId)) {
                const now = new Date().toISOString();
                queryClient.setQueryData(todayQueryKey, [{
                    id: `optimistic-${taskId}`,
                    user: task.user,
                    date: `${todayDate} 00:00:00.000Z`,
                    task,
                    position: 0,
                    created: now,
                    updated: now,
                }, ...previousToday]);
            }
            return { previousToday };
        },
        onSuccess: () => {
            setFeedback({ tone: 'success', message: 'Added to My day.' });
        },
        onError: (error, _taskId, context) => {
            if (context?.previousToday) {
                queryClient.setQueryData(queryKeys.today.date(todayDate), context.previousToday);
            }
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not add to My day.') });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) }),
    });

    const removeFromTodayMutation = useMutation({
        mutationFn: removeTaskFromToday,
        onMutate: async (dailyTaskId: string) => {
            const todayQueryKey = queryKeys.today.date(todayDate);
            await queryClient.cancelQueries({ queryKey: todayQueryKey });
            const previousToday = queryClient.getQueryData<DailyTaskWithTask[]>(todayQueryKey) ?? [];
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
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not remove from My day.') });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) }),
    });

    const renameTaskMutation = useMutation({
        mutationFn: ({ taskId, title }: { taskId: string; title: string; }) => updateTask(taskId, { title }),
        onSuccess: async (_data, variables) => {
            setEditingTaskId(null);
            setDraftTaskTitle('');
            setFeedback({ tone: 'success', message: 'Task renamed.' });
            const task = inboxItems.find((item) => item.id === variables.taskId);
            if (task?.project) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(task.project) });
            } else {
                await queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not rename task.') });
        },
    });

    const bulkCompleteMutation = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await Promise.all(taskIds.map((taskId) => toggleTaskCompletion(taskId, true)));
        },
        onSuccess: (_data, taskIds) => {
            setSelectedTaskIds([]);
            setFeedback({ tone: 'success', message: `${taskIds.length} task${taskIds.length === 1 ? '' : 's'} completed.` });
            void queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            void queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not complete selected tasks.') });
        },
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (taskIds: string[]) => {
            await Promise.all(taskIds.map((taskId) => deleteTask(taskId)));
        },
        onSuccess: (_data, taskIds) => {
            setSelectedTaskIds([]);
            setFeedback({ tone: 'success', message: `${taskIds.length} task${taskIds.length === 1 ? '' : 's'} deleted.` });
            void queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            void queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not delete selected tasks.') });
        },
    });

    const bulkProjectMutation = useMutation({
        mutationFn: async ({ taskIds, projectId }: { taskIds: string[]; projectId: string | null; }) => {
            await Promise.all(taskIds.map((taskId) => updateTask(taskId, { project: projectId })));
        },
        onSuccess: (_data, variables) => {
            setSelectedTaskIds([]);
            setBulkProjectId('');
            setFeedback({ tone: 'success', message: `${variables.taskIds.length} task${variables.taskIds.length === 1 ? '' : 's'} assigned.` });
            void queryClient.invalidateQueries({ queryKey: inboxQueryKey });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not assign project to selected tasks.') });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteTask,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
            queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        },
        onError: (error) => {
            setFeedback({ tone: 'error', message: getActionErrorMessage(error, 'Could not delete task.') });
        },
    });

    const commitTaskTitle = (taskId: string, currentTitle: string) => {
        const trimmed = draftTaskTitle.trim();
        if (!trimmed || trimmed === currentTitle) {
            setEditingTaskId(null);
            setDraftTaskTitle('');
            return;
        }

        renameTaskMutation.mutate({ taskId, title: trimmed });
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const title = capture.trim();
        if (!title) return;
        createMutation.mutate({ title, project: null, parent: null });
    };

    const toggleTaskSelection = (taskId: string) => {
        setSelectedTaskIds((current) => current.includes(taskId)
            ? current.filter((id) => id !== taskId)
            : [...current, taskId]);
    };

    const toggleSelectAllVisible = () => {
        if (allVisibleSelected) {
            setSelectedTaskIds((current) => current.filter((id) => !visibleTaskIds.includes(id)));
            return;
        }

        setSelectedTaskIds((current) => {
            const next = new Set(current);
            visibleTaskIds.forEach((id) => next.add(id));
            return [...next];
        });
    };

    const clearSelection = () => {
        setSelectedTaskIds([]);
    };

    const handleBulkComplete = () => {
        if (selectedTaskIds.length === 0) return;
        bulkCompleteMutation.mutate(selectedTaskIds);
    };

    const handleBulkDelete = () => {
        if (selectedTaskIds.length === 0) return;
        bulkDeleteMutation.mutate(selectedTaskIds);
    };

    const handleBulkAssignProject = () => {
        if (selectedTaskIds.length === 0) return;
        bulkProjectMutation.mutate({
            taskIds: selectedTaskIds,
            projectId: bulkProjectId || null,
        });
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

    const submitChildTask = (parentTaskId: string, childCount: number) => {
        const title = childTitle.trim();
        if (!title) return;
        createChildMutation.mutate({ title, parentTaskId, position: childCount });
    };

    const applyTreeUpdate = (nextTasks: Task[]) => {
        const changes = derivePositionChanges(inboxItems, nextTasks);
        if (changes.length === 0) return;
        persistTreeMutation.mutate({ changes, nextTasks });
    };

    const handleDragStart = (event: DragStartEvent) => {
        if (!isReorderModeActive) return;
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragId(null);
        if (!isReorderModeActive) return;
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        if (!overId || activeId === overId) return;

        const overRow = inboxRows.find((row) => row.task.id === overId);
        if (!overRow) return;

        if (event.delta.x < -24) {
            applyTreeUpdate(outdentTask(inboxItems, activeId));
            return;
        }

        if (event.delta.x > 24) {
            const childCount = inboxRows.filter((row) => row.parentId === overId).length;
            applyTreeUpdate(moveTaskWithinTree(inboxItems, activeId, overId, childCount));
            return;
        }

        const siblings = inboxRows.filter((row) => row.parentId === overRow.parentId);
        const overIndex = siblings.findIndex((row) => row.task.id === overId);
        if (overIndex < 0) return;

        const targetIndex = event.delta.y > 0 ? overIndex + 1 : overIndex;
        applyTreeUpdate(moveTaskWithinTree(inboxItems, activeId, overRow.parentId, targetIndex));
    };

    return (
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Box>
                <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>Inbox</Heading>
                <Text color='var(--text-muted)' mt={2}>Capture now, organize when you’re ready.</Text>
            </Box>

            <ActionStatus feedback={feedback} onClear={() => setFeedback(null)} />

            <TaskFilters
                value={taskFilters}
                onChange={setTaskFilters}
                projectOptions={projectOptions}
                contextLabel='Inbox'
                onClearFilters={() => setTaskFilters(DEFAULT_TASK_FILTER_STATE)}
                showDnDHint={dragHint}
                selectionControls={(
                    <Flex align='center' justify='space-between' gap={3} wrap='wrap'>
                        <Flex align='center' gap={2} wrap='wrap'>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                borderColor='var(--control-border)'
                                bg='var(--panel-bg)'
                                color='var(--text-soft)'
                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                onClick={toggleSelectAllVisible}
                                disabled={visibleTaskIds.length === 0}
                                data-tooltip-disabled='true'
                            >
                                {allVisibleSelected ? 'Clear visible selection' : 'Select visible'}
                            </Button>

                            {inboxCanReorder ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant={isReorderModeActive ? 'solid' : 'outline'}
                                    bg={isReorderModeActive ? 'var(--accent)' : 'var(--panel-bg)'}
                                    color={isReorderModeActive ? 'white' : 'var(--text-soft)'}
                                    borderColor='var(--control-border)'
                                    _hover={{ bg: isReorderModeActive ? 'var(--accent-soft)' : 'var(--panel-bg-soft)', color: isReorderModeActive ? 'white' : 'var(--app-text)' }}
                                    onClick={() => {
                                        setReorderMode((current) => !current);
                                        if (activeDragId) setActiveDragId(null);
                                    }}
                                    data-tooltip-disabled='true'
                                >
                                    {isReorderModeActive ? 'Done reordering' : 'Reorder'}
                                </Button>
                            ) : null}
                        </Flex>

                        {selectedTaskIds.length > 0 ? (
                            <>
                                <Text fontSize='sm' color='var(--text-muted)'>{selectedTaskIds.length} selected</Text>
                                <Flex align='center' gap={2} wrap='wrap'>
                                    <Button type='button' size='sm' bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} onClick={handleBulkComplete} loading={bulkCompleteMutation.isPending} data-tooltip-disabled='true'>
                                        Complete
                                    </Button>
                                    <Button type='button' size='sm' variant='outline' borderColor='red.200' color='red.600' _hover={{ bg: 'red.50', color: 'red.700' }} onClick={handleBulkDelete} loading={bulkDeleteMutation.isPending} data-tooltip-disabled='true'>
                                        Delete
                                    </Button>
                                    <select
                                        value={bulkProjectId}
                                        onChange={(event) => setBulkProjectId(event.target.value)}
                                        style={{
                                            minWidth: '170px',
                                            height: '32px',
                                            padding: '0 10px',
                                            border: '1px solid var(--control-border)',
                                            borderRadius: '8px',
                                            background: 'var(--control-bg)',
                                            color: 'var(--control-text)',
                                        }}
                                        aria-label='Assign selected tasks to project'
                                    >
                                        <option value=''>Unassigned</option>
                                        {projectOptions.map((project) => (
                                            <option key={project.id} value={project.id}>{project.label}</option>
                                        ))}
                                    </select>
                                    <Button type='button' size='sm' variant='outline' borderColor='var(--control-border)' bg='var(--panel-bg)' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={handleBulkAssignProject} loading={bulkProjectMutation.isPending} data-tooltip-disabled='true'>
                                        Assign project
                                    </Button>
                                    <Button type='button' size='sm' variant='outline' borderColor='var(--control-border)' bg='var(--panel-bg)' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={clearSelection} data-tooltip-disabled='true'>
                                        Clear
                                    </Button>
                                </Flex>
                            </>
                        ) : null}
                    </Flex>
                )}
            />

            {hasTaskFilters ? <Text color='var(--text-muted)' fontSize='sm'>Filtered view</Text> : null}

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
                    <EmptyCtaCard
                        title='Your inbox is clear'
                        description='New ideas and tasks will land here.'
                        actionLabel='Create first task'
                        onAction={() => createMutation.mutate({ title: capture.trim() || 'First task', project: null, parent: null })}
                    />
                ) : !hasInboxResults ? (
                    <EmptyCtaCard
                        title='No tasks match your filters'
                        description='Try a different search, project, or completion filter.'
                        actionLabel='Clear filters'
                        onAction={() => setTaskFilters(DEFAULT_TASK_FILTER_STATE)}
                    />
                ) : inboxCanReorder ? (
                    <List.Root as='ul' gap={0} listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 350px)' }} overflowY='auto' pr={1}>
                        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
                            {inboxRows.map((row) => {
                                const item = row.task;
                                const childCount = allInboxRows.filter((entry) => entry.parentId === item.id).length;
                                const isAddingChild = childParentId === item.id;
                                const showCreatedOverlay = Boolean(recentlyCreatedIds[item.id]);
                                const showCompletedOverlay = Boolean(recentlyCompletedIds[item.id]);
                                const isEditingRow = editingTaskId === item.id;
                                const overlayKind = showCreatedOverlay ? 'created' : showCompletedOverlay ? 'completed' : isEditingRow ? 'editing' : null;

                                return (
                                    <DroppableTaskRow key={item.id} taskId={item.id} depth={row.depth}>
                                        <Box py={4} px={2} position='relative' _hover={{ bg: 'var(--panel-bg-soft)' }} bg={selectedTaskIds.includes(item.id) ? 'var(--panel-bg-soft)' : 'transparent'} borderLeft={selectedTaskIds.includes(item.id) ? '2px solid var(--accent)' : '2px solid transparent'}>
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
                                                <Box w='18px' h='18px' display='flex' alignItems='center' justifyContent='center'>
                                                    <input
                                                        type='checkbox'
                                                        checked={selectedTaskIds.includes(item.id)}
                                                        onChange={() => toggleTaskSelection(item.id)}
                                                        aria-label={`Select task ${item.title}`}
                                                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                                                    />
                                                </Box>
                                                <Button
                                                    type='button'
                                                    aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
                                                    onClick={() => toggleMutation.mutate({ taskId: item.id, checked: !item.completed })}
                                                    disabled={toggleMutation.isPending && toggleMutation.variables?.taskId === item.id}
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
                                                {editingTaskId === item.id ? (
                                                    <Input
                                                        autoFocus
                                                        value={draftTaskTitle}
                                                        onChange={(event) => setDraftTaskTitle(event.target.value)}
                                                        onBlur={() => commitTaskTitle(item.id, item.title)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                commitTaskTitle(item.id, item.title);
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
                                                    <Text flex='1' textDecoration={item.completed ? 'line-through' : 'none'} color={item.completed ? 'var(--text-muted)' : 'var(--app-text)'}>
                                                        {item.title}
                                                    </Text>
                                                )}
                                                {row.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                                <Flex align='center' gap={2} ml='auto'>
                                                    {isReorderModeActive ? <DraggableGrip taskId={item.id} /> : null}
                                                    <Button
                                                        type='button'
                                                        aria-label={editingTaskId === item.id ? 'Save task title' : `Edit task ${item.title}`}
                                                        title={editingTaskId === item.id ? 'Save task title' : 'Edit task title'}
                                                        size='xs'
                                                        variant='outline'
                                                        bg='var(--panel-bg)'
                                                        borderColor='var(--control-border)'
                                                        color='var(--text-soft)'
                                                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                        onClick={() => {
                                                            if (editingTaskId === item.id) {
                                                                commitTaskTitle(item.id, item.title);
                                                                return;
                                                            }
                                                            setEditingTaskId(item.id);
                                                            setDraftTaskTitle(item.title);
                                                        }}
                                                        disabled={renameTaskMutation.isPending && renameTaskMutation.variables?.taskId === item.id}
                                                        minW='28px'
                                                        w='28px'
                                                        h='28px'
                                                        p={0}
                                                    >
                                                        {editingTaskId === item.id ? <Check size={12} /> : <Pencil size={12} />}
                                                    </Button>
                                                    <Button
                                                        type='button'
                                                        aria-label={`Add child task to ${item.title}`}
                                                        size='xs'
                                                        variant='outline'
                                                        bg='var(--panel-bg)'
                                                        borderColor='var(--control-border)'
                                                        color='var(--text-soft)'
                                                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                        onClick={() => openChildEditor(item.id)}
                                                        disabled={createChildMutation.isPending}
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
                                                        borderColor='var(--control-border)'
                                                        color='var(--text-soft)'
                                                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                        data-tooltip-disabled='true'
                                                        loading={addToTodayMutation.isPending && addToTodayMutation.variables === item.id || removeFromTodayMutation.isPending && removeFromTodayMutation.variables === dailyTaskIds.get(item.id)}
                                                        onClick={() => {
                                                            const dailyTaskId = dailyTaskIds.get(item.id);
                                                            if (dailyTaskId) removeFromTodayMutation.mutate(dailyTaskId);
                                                            else addToTodayMutation.mutate(item.id);
                                                        }}
                                                        disabled={persistTreeMutation.isPending}
                                                    >
                                                        <CalendarPlus size={13} />
                                                        <Box as='span' ml={1}>{dailyTaskIds.has(item.id) ? 'Remove from My day' : 'My day'}</Box>
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
                                                        onClick={() => deleteMutation.mutate(item.id)}
                                                        loading={deleteMutation.isPending && deleteMutation.variables === item.id}
                                                        disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                                                        minW='28px'
                                                        w='28px'
                                                        h='28px'
                                                        p={0}
                                                    >
                                                        <Trash2 size={12} />
                                                    </Button>
                                                </Flex>
                                            </Flex>
                                            {isAddingChild ? (
                                                <Flex mt={3} ml={8} gap={2} align='center'>
                                                    <Input
                                                        autoFocus
                                                        value={childTitle}
                                                        onChange={(event) => setChildTitle(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                submitChildTask(item.id, childCount);
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
                                                        loading={createChildMutation.isPending && childParentId === item.id}
                                                        onClick={() => submitChildTask(item.id, childCount)}
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
                                                        disabled={createChildMutation.isPending}
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
                                    </DroppableTaskRow>
                                );
                            })}
                            <DragOverlay>
                                {activeDragTask ? (
                                    <Box
                                        border='1px solid'
                                        borderColor='var(--panel-border)'
                                        bg='var(--panel-bg)'
                                        borderRadius='10px'
                                        px={3}
                                        py={3}
                                        boxShadow='lg'
                                        minW={{ base: '240px', md: '420px' }}
                                    >
                                        <Flex align='center' gap={2}>
                                            <GripVertical size={14} color='var(--text-muted)' />
                                            <Text flex='1' color='var(--app-text)'>{activeDragTask.task.title}</Text>
                                            {activeDragTask.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                        </Flex>
                                    </Box>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </List.Root>
                ) : (
                    <List.Root as='ul' gap={0} listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 350px)' }} overflowY='auto' pr={1}>
                        {inboxRows.map((row) => {
                            const item = row.task;
                            const childCount = allInboxRows.filter((entry) => entry.parentId === item.id).length;
                            const isAddingChild = childParentId === item.id;
                            const showCreatedOverlay = Boolean(recentlyCreatedIds[item.id]);

                            return (
                                <List.Item key={item.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                    <Box py={4} px={2} pl={`${row.depth * 22 + 2}px`} position='relative' _hover={{ bg: 'var(--panel-bg-soft)' }} bg={selectedTaskIds.includes(item.id) ? 'var(--panel-bg-soft)' : 'transparent'} borderLeft={selectedTaskIds.includes(item.id) ? '2px solid var(--accent)' : '2px solid transparent'}>
                                        {showCreatedOverlay ? (
                                            <Flex
                                                position='absolute'
                                                inset='0'
                                                align='flex-start'
                                                justify='flex-end'
                                                p={2}
                                                pointerEvents='none'
                                                bg='rgba(53, 99, 233, 0.06)'
                                                animation={`${createdOverlayFade} ${CREATED_OVERLAY_MS}ms ease-out forwards`}
                                                zIndex={2}
                                            >
                                                <Flex
                                                    align='center'
                                                    gap={1.5}
                                                    px={2.5}
                                                    py={1}
                                                    borderRadius='999px'
                                                    border='1px solid'
                                                    borderColor='green.200'
                                                    bg='white'
                                                    color='green.700'
                                                    boxShadow='sm'
                                                    animation={`${createdBadgePop} ${CREATED_OVERLAY_MS}ms ease-out forwards`}
                                                    aria-label='Task created'
                                                >
                                                    <Check size={12} />
                                                    <Text fontSize='xs' fontWeight='700'>Created</Text>
                                                </Flex>
                                            </Flex>
                                        ) : null}
                                        <Flex align='center' gap={3}>
                                            <Box w='18px' h='18px' display='flex' alignItems='center' justifyContent='center'>
                                                <input
                                                    type='checkbox'
                                                    checked={selectedTaskIds.includes(item.id)}
                                                    onChange={() => toggleTaskSelection(item.id)}
                                                    aria-label={`Select task ${item.title}`}
                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                                                />
                                            </Box>
                                            <Button
                                                type='button'
                                                aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
                                                onClick={() => toggleMutation.mutate({ taskId: item.id, checked: !item.completed })}
                                                disabled={toggleMutation.isPending && toggleMutation.variables?.taskId === item.id}
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
                                            {editingTaskId === item.id ? (
                                                <Input
                                                    autoFocus
                                                    value={draftTaskTitle}
                                                    onChange={(event) => setDraftTaskTitle(event.target.value)}
                                                    onBlur={() => commitTaskTitle(item.id, item.title)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            commitTaskTitle(item.id, item.title);
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
                                                <Text flex='1' textDecoration={item.completed ? 'line-through' : 'none'} color={item.completed ? 'var(--text-muted)' : 'var(--app-text)'}>
                                                    {item.title}
                                                </Text>
                                            )}
                                            {row.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                            <Flex align='center' gap={2} ml='auto'>
                                                {isReorderModeActive ? (
                                                    <Box w='28px' h='28px' display='flex' alignItems='center' justifyContent='center' color='var(--text-muted)' aria-hidden='true'>
                                                        <GripVertical size={14} />
                                                    </Box>
                                                ) : null}
                                                <Button
                                                    type='button'
                                                    aria-label={editingTaskId === item.id ? 'Save task title' : `Edit task ${item.title}`}
                                                    title={editingTaskId === item.id ? 'Save task title' : 'Edit task title'}
                                                    size='xs'
                                                    variant='outline'
                                                    bg='var(--panel-bg)'
                                                    borderColor='var(--control-border)'
                                                    color='var(--text-soft)'
                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                    onClick={() => {
                                                        if (editingTaskId === item.id) {
                                                            commitTaskTitle(item.id, item.title);
                                                            return;
                                                        }
                                                        setEditingTaskId(item.id);
                                                        setDraftTaskTitle(item.title);
                                                    }}
                                                    disabled={renameTaskMutation.isPending && renameTaskMutation.variables?.taskId === item.id}
                                                    minW='28px'
                                                    w='28px'
                                                    h='28px'
                                                    p={0}
                                                >
                                                    {editingTaskId === item.id ? <Check size={12} /> : <Pencil size={12} />}
                                                </Button>
                                                <Button
                                                    type='button'
                                                    aria-label={`Add child task to ${item.title}`}
                                                    size='xs'
                                                    variant='outline'
                                                    bg='var(--panel-bg)'
                                                    borderColor='var(--control-border)'
                                                    color='var(--text-soft)'
                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                    onClick={() => openChildEditor(item.id)}
                                                    disabled={createChildMutation.isPending}
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
                                                    borderColor='var(--control-border)'
                                                    color='var(--text-soft)'
                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                    data-tooltip-disabled='true'
                                                    loading={(addToTodayMutation.isPending && addToTodayMutation.variables === item.id) || (removeFromTodayMutation.isPending && removeFromTodayMutation.variables === dailyTaskIds.get(item.id))}
                                                    onClick={() => {
                                                        const dailyTaskId = dailyTaskIds.get(item.id);
                                                        if (dailyTaskId) removeFromTodayMutation.mutate(dailyTaskId);
                                                        else addToTodayMutation.mutate(item.id);
                                                    }}
                                                    disabled={persistTreeMutation.isPending}
                                                >
                                                    <CalendarPlus size={13} />
                                                    <Box as='span' ml={1}>{dailyTaskIds.has(item.id) ? 'Remove from My day' : 'My day'}</Box>
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
                                                    onClick={() => deleteMutation.mutate(item.id)}
                                                    loading={deleteMutation.isPending && deleteMutation.variables === item.id}
                                                    disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                                                    minW='28px'
                                                    w='28px'
                                                    h='28px'
                                                    p={0}
                                                >
                                                    <Trash2 size={12} />
                                                </Button>
                                            </Flex>
                                        </Flex>
                                        {isAddingChild ? (
                                            <Flex mt={3} ml={8} gap={2} align='center'>
                                                <Input
                                                    autoFocus
                                                    value={childTitle}
                                                    onChange={(event) => setChildTitle(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            submitChildTask(item.id, childCount);
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
                                                    loading={createChildMutation.isPending && childParentId === item.id}
                                                    onClick={() => submitChildTask(item.id, childCount)}
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
                                                    disabled={createChildMutation.isPending}
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

export default InboxPage;
