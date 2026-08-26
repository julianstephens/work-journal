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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, GripVertical, Inbox as InboxIcon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import type { Task } from '../../types/pocketbase';
import { createTask, listInboxTasks, toggleTaskCompletion, updateTask } from '../tasks/api';
import {
    buildTaskRows,
    derivePositionChanges,
    moveTaskWithinTree,
    outdentTask,
} from '../tasks/tree';
import { addTaskToToday, listToday, removeTaskFromToday } from '../today/api';

const EMPTY_TASKS: Task[] = [];

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
    const [capture, setCapture] = useState('');
    const [childParentId, setChildParentId] = useState<string | null>(null);
    const [childTitle, setChildTitle] = useState('');
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const todayDate = getLocalIsoDate();
    const inboxQueryKey = queryKeys.tasks.inbox();
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8,
        },
    }));

    const { data: inboxItems = EMPTY_TASKS, isLoading } = useQuery({
        queryKey: inboxQueryKey,
        queryFn: listInboxTasks,
    });
    const { data: todayItems = [] } = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });
    const dailyTaskIds = useMemo(() => new Map(todayItems.map((item) => [item.task.id, item.id])), [todayItems]);
    const inboxRows = useMemo(() => buildTaskRows(inboxItems), [inboxItems]);
    const activeDragTask = useMemo(() => {
        if (!activeDragId) return null;
        const row = inboxRows.find((item) => item.task.id === activeDragId);
        return row ?? null;
    }, [activeDragId, inboxRows]);

    const createMutation = useMutation({
        mutationFn: createTask,
        onSuccess: () => {
            setCapture('');
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
        },
    });

    const createChildMutation = useMutation({
        mutationFn: ({ title, parentTaskId, position }: { title: string; parentTaskId: string; position: number; }) => createTask({
            title,
            project: null,
            parent: parentTaskId,
            position,
        }),
        onSuccess: () => {
            setChildParentId(null);
            setChildTitle('');
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ taskId, checked }: { taskId: string; checked: boolean; }) => toggleTaskCompletion(taskId, checked),
        onSuccess: () => {
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
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: inboxQueryKey });
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
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragId(null);
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
                        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
                            {inboxRows.map((row) => {
                                const item = row.task;
                                const childCount = inboxRows.filter((entry) => entry.parentId === item.id).length;
                                const isAddingChild = childParentId === item.id;

                                return (
                                    <DroppableTaskRow key={item.id} taskId={item.id} depth={row.depth}>
                                        <Box py={4} px={2} _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                            <Flex align='center' gap={2}>
                                                <DraggableGrip taskId={item.id} />
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
                                                {row.depth > 0 ? <Text fontSize='xs' color='var(--text-muted)'>Subtask</Text> : null}
                                                <Button
                                                    type='button'
                                                    size='xs'
                                                    variant='outline'
                                                    bg='var(--panel-bg)'
                                                    borderColor='var(--control-border)'
                                                    color='var(--text-soft)'
                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                    onClick={() => openChildEditor(item.id)}
                                                >
                                                    <Plus size={12} />
                                                    <Box as='span' ml={1}>Child</Box>
                                                </Button>
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
                )}
            </Box>

        </Stack>
    );
}

export default InboxPage;
