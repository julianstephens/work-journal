import {
    Box,
    Button,
    Flex,
    Heading,
    Input,
    Stack,
    Text,
    Textarea,
} from '@chakra-ui/react';
import {
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    CalendarPlus,
    Check,
    CornerDownRight,
    CornerUpLeft,
    Edit2,
    FileText,
    GripVertical,
    Plus,
    Save,
    Trash2,
    X,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { queryKeys } from '../../lib/query-keys';
import type { Task } from '../../types/pocketbase';
import { createNote, deleteNote, listNotesForProject, updateNote } from '../notes/api';
import { createTask, deleteTask, listTasksForProject, updateTask } from '../tasks/api';
import {
    buildTaskRows,
    collectSubtreeIds,
    derivePositionChanges,
    indentTask,
    listMoveUnderCandidates,
    moveTaskDown,
    moveTaskUp,
    moveTaskWithinTree,
    outdentTask,
} from '../tasks/tree';
import { addTaskToToday, listToday, removeTaskFromToday } from '../today/api';
import { listProjects } from './api';

function getLocalIsoDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

type PersistTreePayload = {
    changes: Array<{ id: string; parent: string | null; position: number; }>;
    nextTasks: Task[];
};

const EMPTY_TASKS: Task[] = [];

type TaskActionMenuProps = {
    isOpen: boolean;
    onClose: () => void;
    onAddChild: () => void;
    onStartRename: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onIndent: () => void;
    onOutdent: () => void;
    onOpenMoveUnder: () => void;
    onDelete: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    canIndent: boolean;
    canOutdent: boolean;
};

function TaskActionMenu(props: TaskActionMenuProps) {
    if (!props.isOpen) return null;

    return (
        <Box
            position='absolute'
            top='calc(100% + 4px)'
            right='0'
            zIndex={20}
            bg='var(--panel-bg)'
            border='1px solid'
            borderColor='var(--panel-border)'
            borderRadius='8px'
            minW='200px'
            boxShadow='md'
            p={1}
        >
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => { props.onAddChild(); props.onClose(); }}>Add child</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => { props.onStartRename(); props.onClose(); }}>Rename</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} disabled={!props.canMoveUp} onClick={() => { props.onMoveUp(); props.onClose(); }}>Move up</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} disabled={!props.canMoveDown} onClick={() => { props.onMoveDown(); props.onClose(); }}>Move down</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} disabled={!props.canIndent} onClick={() => { props.onIndent(); props.onClose(); }}>Indent</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} disabled={!props.canOutdent} onClick={() => { props.onOutdent(); props.onClose(); }}>Outdent</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => { props.onOpenMoveUnder(); props.onClose(); }}>Move under…</Button>
            <Button size='xs' variant='ghost' w='full' justifyContent='flex-start' color='red.600' _hover={{ bg: 'red.50', color: 'red.700' }} onClick={() => { props.onDelete(); props.onClose(); }}>Delete</Button>
        </Box>
    );
}

function DraggableGrip({ taskId }: { taskId: string; }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: taskId });

    return (
        <Button
            ref={setNodeRef}
            size='xs'
            variant='ghost'
            cursor={isDragging ? 'grabbing' : 'grab'}
            color='var(--text-muted)'
            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
            _active={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
            {...listeners}
            {...attributes}
            style={{
                transform: CSS.Translate.toString(transform),
            }}
            aria-label='Drag task'
        >
            <GripVertical size={14} />
        </Button>
    );
}

function DroppableTaskContainer({
    taskId,
    children,
    depth,
}: {
    taskId: string;
    children: ReactNode;
    depth: number;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: taskId });

    return (
        <Box
            ref={setNodeRef}
            borderBottom='1px solid'
            borderColor='var(--panel-border)'
            py={3}
            pl={`${depth * 22 + 8}px`}
            pr={2}
            bg={isOver ? 'var(--panel-bg-soft)' : 'transparent'}
        >
            {children}
        </Box>
    );
}

function ProjectDetailPage() {
    const navigate = useNavigate();
    const { projectId } = useParams();
    const queryClient = useQueryClient();
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newNoteTitle, setNewNoteTitle] = useState('');
    const [newNoteBody, setNewNoteBody] = useState('');
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [draftNoteTitle, setDraftNoteTitle] = useState('');
    const [draftNoteBody, setDraftNoteBody] = useState('');
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [draftTaskTitle, setDraftTaskTitle] = useState('');
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
    const [moveTargetId, setMoveTargetId] = useState('');
    const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
    const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
    const todayDate = useMemo(() => getLocalIsoDate(), []);
    const taskQueryKey = queryKeys.tasks.project(projectId ?? 'missing');
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8,
        },
    }));

    const projectQuery = useQuery({
        queryKey: queryKeys.projects.detail(projectId ?? 'missing'),
        queryFn: async () => {
            const projects = await listProjects();
            const selected = projects.find((project) => project.id === projectId);
            if (!selected) {
                throw new Error('Project not found');
            }
            return selected;
        },
        enabled: Boolean(projectId),
    });

    const tasksQuery = useQuery({
        queryKey: queryKeys.tasks.project(projectId ?? 'missing'),
        queryFn: () => listTasksForProject(projectId ?? ''),
        enabled: Boolean(projectId),
    });

    const notesQuery = useQuery({
        queryKey: queryKeys.notes.project(projectId ?? 'missing'),
        queryFn: () => listNotesForProject(projectId ?? ''),
        enabled: Boolean(projectId),
    });

    const todayQuery = useQuery({
        queryKey: queryKeys.today.date(todayDate),
        queryFn: () => listToday(todayDate),
    });

    const createTaskMutation = useMutation({
        mutationFn: (input: { title: string; parent?: string | null; position?: number; }) => createTask({
            title: input.title,
            project: projectId ?? null,
            parent: input.parent ?? null,
            position: input.position,
        }),
        onSuccess: () => {
            setNewTaskTitle('');
            queryClient.invalidateQueries({ queryKey: taskQueryKey });
        },
    });

    const persistTreeMutation = useMutation({
        mutationFn: async ({
            changes,
        }: PersistTreePayload) => {
            await Promise.all(
                changes.map((change) => updateTask(change.id, {
                    parent: change.parent,
                    position: change.position,
                })),
            );
        },
        onMutate: async ({ nextTasks }: PersistTreePayload) => {
            await queryClient.cancelQueries({ queryKey: taskQueryKey });
            const previousTasks = queryClient.getQueryData<Task[]>(taskQueryKey) ?? [];
            queryClient.setQueryData(taskQueryKey, nextTasks);
            return { previousTasks };
        },
        onError: (_error, _variables, context) => {
            if (context?.previousTasks) {
                queryClient.setQueryData(taskQueryKey, context.previousTasks);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: taskQueryKey });
        },
    });

    const renameTaskMutation = useMutation({
        mutationFn: ({ taskId, title }: { taskId: string; title: string; }) => updateTask(taskId, { title }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskQueryKey });
        },
    });

    const deleteTaskMutation = useMutation({
        mutationFn: async (taskIds: string[]) => {
            for (const taskId of [...taskIds].reverse()) {
                await deleteTask(taskId);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskQueryKey });
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

    const createNoteMutation = useMutation({
        mutationFn: () => createNote({
            project: projectId ?? '',
            title: newNoteTitle.trim() || 'Untitled note',
            body: newNoteBody.trim(),
        }),
        onSuccess: () => {
            setNewNoteTitle('');
            setNewNoteBody('');
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(projectId ?? 'missing') });
        },
    });

    const updateNoteMutation = useMutation({
        mutationFn: () => {
            if (!editingNoteId) throw new Error('No note selected for editing');
            return updateNote(editingNoteId, {
                title: draftNoteTitle.trim() || 'Untitled note',
                body: draftNoteBody.trim(),
            });
        },
        onSuccess: () => {
            setEditingNoteId(null);
            setDraftNoteTitle('');
            setDraftNoteBody('');
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(projectId ?? 'missing') });
        },
    });

    const deleteNoteMutation = useMutation({
        mutationFn: (noteId: string) => deleteNote(noteId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(projectId ?? 'missing') });
        },
    });

    const project = projectQuery.data;
    const tasks = tasksQuery.data ?? EMPTY_TASKS;
    const taskRows = useMemo(() => buildTaskRows(tasks), [tasks]);
    const activeDragRow = useMemo(() => {
        if (!activeDragId) return null;
        return taskRows.find((row) => row.task.id === activeDragId) ?? null;
    }, [activeDragId, taskRows]);
    const notes = notesQuery.data ?? [];
    const dailyTaskIds = useMemo(() => new Map((todayQuery.data ?? []).map((item) => [item.task.id, item.id])), [todayQuery.data]);

    const applyTaskTreeUpdate = (nextTasks: Task[]) => {
        const changes = derivePositionChanges(tasks, nextTasks);
        if (changes.length === 0) return;

        persistTreeMutation.mutate({ changes, nextTasks });
    };

    const commitTaskTitle = (taskId: string, currentTitle: string) => {
        const title = draftTaskTitle.trim();
        if (!title) {
            setEditingTaskId(null);
            setDraftTaskTitle('');
            return;
        }

        if (title !== currentTitle) {
            renameTaskMutation.mutate({ taskId, title });
        }

        setEditingTaskId(null);
        setDraftTaskTitle('');
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragId(null);
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        if (!overId || activeId === overId) return;

        const activeRow = taskRows.find((row) => row.task.id === activeId);
        const overRow = taskRows.find((row) => row.task.id === overId);
        if (!activeRow || !overRow) return;

        const deltaX = event.delta.x;
        const deltaY = event.delta.y;

        if (deltaX > 24) {
            const nextIndex = taskRows.filter((row) => row.parentId === overId).length;
            const nextTasks = moveTaskWithinTree(tasks, activeId, overId, nextIndex);
            applyTaskTreeUpdate(nextTasks);
            return;
        }

        if (deltaX < -24) {
            applyTaskTreeUpdate(outdentTask(tasks, activeId));
            return;
        }

        const overSiblings = taskRows.filter((row) => row.parentId === overRow.parentId);
        const overIndex = overSiblings.findIndex((row) => row.task.id === overId);
        if (overIndex < 0) return;

        const targetIndex = deltaY > 0 ? overIndex + 1 : overIndex;
        const nextTasks = moveTaskWithinTree(tasks, activeId, overRow.parentId, targetIndex);
        applyTaskTreeUpdate(nextTasks);
    };

    const subtitle = useMemo(() => {
        if (!project) return 'Loading project…';
        return project.description || 'Project details';
    }, [project]);

    if (!projectId) {
        return <Text color='var(--text-muted)'>Missing project id.</Text>;
    }

    if (projectQuery.isLoading) {
        return <Text color='var(--text-muted)'>Loading project…</Text>;
    }

    if (projectQuery.isError || !project) {
        return (
            <Stack gap={4} maxW='900px'>
                <Heading as='h2' size='lg'>Project not found</Heading>
                <Button variant='outline' colorScheme='gray' onClick={() => navigate('/projects')}>Back to projects</Button>
            </Stack>
        );
    }

    return (
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Flex align='center' justify='space-between' gap={4}>
                <Flex align='center' gap={3}>
                    <Button
                        variant='outline'
                        bg='var(--panel-bg)'
                        borderColor='var(--control-border)'
                        color='var(--app-text)'
                        _hover={{ bg: 'var(--panel-bg-soft)', borderColor: 'var(--text-muted)' }}
                        borderRadius='8px'
                        onClick={() => navigate('/projects')}
                        aria-label='Back to projects'
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <Box>
                        <Text color='var(--text-muted)' fontSize='sm'>Project</Text>
                        <Heading as='h2' size='lg'>{project.name}</Heading>
                    </Box>
                </Flex>
            </Flex>

            <Text color='var(--text-soft)'>{subtitle}</Text>

            <Stack gap={10}>
                <Box>
                    <Flex align='center' justify='space-between' mb={4}>
                        <Heading as='h3' size='md'>Tasks</Heading>
                        <Text fontSize='sm' color='var(--text-muted)'>{tasks.length} total</Text>
                    </Flex>

                    <Flex gap={2} mb={4}>
                        <Input
                            value={newTaskTitle}
                            onChange={(event) => setNewTaskTitle(event.target.value)}
                            placeholder='Add task to this project'
                            bg='var(--control-bg)'
                            color='var(--control-text)'
                            borderColor='var(--control-border)'
                        />
                        <Button
                            bg='var(--accent)'
                            color='white'
                            _hover={{ bg: 'var(--accent-soft)' }}
                            onClick={() => {
                                const title = newTaskTitle.trim();
                                if (!title) return;
                                createTaskMutation.mutate({ title });
                            }}
                            loading={createTaskMutation.isPending}
                        >
                            <Plus size={14} />
                            <Box as='span' ml={2}>Add</Box>
                        </Button>
                    </Flex>

                    <Stack gap={0} maxH={{ base: 'none', xl: 'calc(100vh - 365px)' }} overflowY='auto' pr={1} borderTop='1px solid' borderColor='var(--panel-border)'>
                        {tasks.length === 0 ? (
                            <Text color='var(--text-muted)'>No tasks in this project yet.</Text>
                        ) : (
                            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
                                {taskRows.map((row) => {
                                    const task = row.task;
                                    const isEditing = editingTaskId === task.id;
                                    const siblingRows = taskRows.filter((item) => item.parentId === row.parentId);
                                    const siblingIndex = siblingRows.findIndex((item) => item.task.id === task.id);
                                    const childCount = taskRows.filter((item) => item.parentId === task.id).length;
                                    const candidates = listMoveUnderCandidates(tasks, task.id);
                                    const subtreeIds = confirmDeleteTaskId === task.id ? collectSubtreeIds(tasks, task.id) : [];

                                    return (
                                        <DroppableTaskContainer key={task.id} taskId={task.id} depth={row.depth}>
                                            <Flex justify='space-between' gap={3} align='flex-start'>
                                                <Box flex='1' minW='0'>
                                                    {isEditing ? (
                                                        <Input
                                                            value={draftTaskTitle}
                                                            onChange={(event) => setDraftTaskTitle(event.target.value)}
                                                            onBlur={() => commitTaskTitle(task.id, task.title)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    commitTaskTitle(task.id, task.title);
                                                                }

                                                                if (event.key === 'Escape') {
                                                                    setEditingTaskId(null);
                                                                    setDraftTaskTitle('');
                                                                }
                                                            }}
                                                            autoFocus
                                                            bg='var(--control-bg)'
                                                            color='var(--control-text)'
                                                            borderColor='var(--control-border)'
                                                        />
                                                    ) : (
                                                        <Text
                                                            fontWeight='medium'
                                                            onDoubleClick={() => {
                                                                setEditingTaskId(task.id);
                                                                setDraftTaskTitle(task.title);
                                                            }}
                                                            cursor='text'
                                                            truncate
                                                        >
                                                            {task.title}
                                                        </Text>
                                                    )}
                                                    <Text color='var(--text-muted)' fontSize='sm'>
                                                        Status: {task.completed ? 'Complete' : 'Open'}
                                                    </Text>

                                                    {movingTaskId === task.id ? (
                                                        <Flex mt={2} gap={2} align='center' wrap='wrap'>
                                                            <select
                                                                value={moveTargetId}
                                                                onChange={(event) => setMoveTargetId(event.target.value)}
                                                                style={{
                                                                    border: '1px solid var(--control-border)',
                                                                    background: 'var(--control-bg)',
                                                                    color: 'var(--control-text)',
                                                                    borderRadius: 6,
                                                                    padding: '4px 8px',
                                                                    minWidth: 220,
                                                                }}
                                                            >
                                                                <option value=''>Top level</option>
                                                                {candidates.map((candidate) => (
                                                                    <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                                                                ))}
                                                            </select>
                                                            <Button
                                                                size='xs'
                                                                variant='outline'
                                                                bg='var(--panel-bg)'
                                                                borderColor='var(--control-border)'
                                                                color='var(--text-soft)'
                                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                                onClick={() => {
                                                                    const parentId = moveTargetId || null;
                                                                    const nextIndex = taskRows.filter((item) => item.parentId === parentId).length;
                                                                    const nextTasks = moveTaskWithinTree(tasks, task.id, parentId, nextIndex);
                                                                    applyTaskTreeUpdate(nextTasks);
                                                                    setMovingTaskId(null);
                                                                    setMoveTargetId('');
                                                                }}
                                                            >
                                                                Apply
                                                            </Button>
                                                            <Button
                                                                size='xs'
                                                                variant='outline'
                                                                bg='var(--panel-bg)'
                                                                borderColor='var(--control-border)'
                                                                color='var(--text-soft)'
                                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                                onClick={() => {
                                                                    setMovingTaskId(null);
                                                                    setMoveTargetId('');
                                                                }}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </Flex>
                                                    ) : null}

                                                    {confirmDeleteTaskId === task.id ? (
                                                        <Flex mt={2} p={2} border='1px solid' borderColor='red.300' borderRadius='8px' bg='red.50' gap={2} align='center' wrap='wrap'>
                                                            <Text fontSize='sm' color='red.700'>
                                                                Delete this task{(subtreeIds.length > 1) ? ` and ${subtreeIds.length - 1} child tasks` : ''}?
                                                            </Text>
                                                            <Button
                                                                size='xs'
                                                                bg='red.600'
                                                                color='white'
                                                                _hover={{ bg: 'red.700' }}
                                                                loading={deleteTaskMutation.isPending}
                                                                onClick={() => {
                                                                    deleteTaskMutation.mutate(subtreeIds);
                                                                    setConfirmDeleteTaskId(null);
                                                                }}
                                                            >
                                                                Confirm
                                                            </Button>
                                                            <Button size='xs' variant='outline' bg='var(--panel-bg)' borderColor='var(--control-border)' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => setConfirmDeleteTaskId(null)}>Cancel</Button>
                                                        </Flex>
                                                    ) : null}
                                                </Box>

                                                <Stack gap={2} align='flex-end'>
                                                    <DraggableGrip taskId={task.id} />

                                                    <Flex gap={1} wrap='wrap' justify='flex-end'>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            data-tooltip-content='Add child task'
                                                            onClick={() => {
                                                                const childTitle = window.prompt('Child task title');
                                                                const title = childTitle?.trim();
                                                                if (!title) return;
                                                                createTaskMutation.mutate({ title, parent: task.id, position: childCount });
                                                            }}
                                                        >
                                                            <Plus size={12} />
                                                            <Box as='span' ml={1}>Child</Box>
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            data-tooltip-content={isEditing ? 'Save task title' : 'Edit task title'}
                                                            onClick={() => {
                                                                if (isEditing) {
                                                                    commitTaskTitle(task.id, task.title);
                                                                } else {
                                                                    setEditingTaskId(task.id);
                                                                    setDraftTaskTitle(task.title);
                                                                }
                                                            }}
                                                        >
                                                            {isEditing ? <Check size={12} /> : <Edit2 size={12} />}
                                                        </Button>
                                                        {isEditing ? (
                                                            <Button
                                                                size='xs'
                                                                variant='outline'
                                                                bg='var(--panel-bg)'
                                                                borderColor='var(--control-border)'
                                                                color='var(--text-soft)'
                                                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                                data-tooltip-content='Cancel editing task title'
                                                                onClick={() => {
                                                                    setEditingTaskId(null);
                                                                    setDraftTaskTitle('');
                                                                }}
                                                            >
                                                                <X size={12} />
                                                            </Button>
                                                        ) : null}
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            disabled={siblingIndex <= 0}
                                                            data-tooltip-content='Move task up'
                                                            onClick={() => applyTaskTreeUpdate(moveTaskUp(tasks, task.id))}
                                                        >
                                                            <ArrowUp size={12} />
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            disabled={siblingIndex === -1 || siblingIndex >= siblingRows.length - 1}
                                                            data-tooltip-content='Move task down'
                                                            onClick={() => applyTaskTreeUpdate(moveTaskDown(tasks, task.id))}
                                                        >
                                                            <ArrowDown size={12} />
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            disabled={taskRows.findIndex((item) => item.task.id === task.id) === 0}
                                                            data-tooltip-content='Indent task'
                                                            onClick={() => applyTaskTreeUpdate(indentTask(tasks, task.id))}
                                                        >
                                                            <CornerDownRight size={12} />
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            disabled={!task.parent}
                                                            data-tooltip-content='Outdent task'
                                                            onClick={() => applyTaskTreeUpdate(outdentTask(tasks, task.id))}
                                                        >
                                                            <CornerUpLeft size={12} />
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            data-tooltip-content='Move task under another task'
                                                            onClick={() => {
                                                                setMovingTaskId(task.id);
                                                                setMoveTargetId('');
                                                            }}
                                                        >
                                                            Move under…
                                                        </Button>
                                                        <Button
                                                            size='xs'
                                                            variant='outline'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            data-tooltip-content='Open task menu'
                                                            onClick={() => setMenuTaskId(menuTaskId === task.id ? null : task.id)}
                                                        >
                                                            •••
                                                        </Button>

                                                        <Box position='relative'>
                                                            <TaskActionMenu
                                                                isOpen={menuTaskId === task.id}
                                                                onClose={() => setMenuTaskId(null)}
                                                                onAddChild={() => {
                                                                    const childTitle = window.prompt('Child task title');
                                                                    const title = childTitle?.trim();
                                                                    if (!title) return;
                                                                    createTaskMutation.mutate({ title, parent: task.id, position: childCount });
                                                                }}
                                                                onStartRename={() => {
                                                                    setEditingTaskId(task.id);
                                                                    setDraftTaskTitle(task.title);
                                                                }}
                                                                onMoveUp={() => applyTaskTreeUpdate(moveTaskUp(tasks, task.id))}
                                                                onMoveDown={() => applyTaskTreeUpdate(moveTaskDown(tasks, task.id))}
                                                                onIndent={() => applyTaskTreeUpdate(indentTask(tasks, task.id))}
                                                                onOutdent={() => applyTaskTreeUpdate(outdentTask(tasks, task.id))}
                                                                onOpenMoveUnder={() => {
                                                                    setMovingTaskId(task.id);
                                                                    setMoveTargetId('');
                                                                }}
                                                                onDelete={() => setConfirmDeleteTaskId(task.id)}
                                                                canMoveUp={siblingIndex > 0}
                                                                canMoveDown={!(siblingIndex === -1 || siblingIndex >= siblingRows.length - 1)}
                                                                canIndent={taskRows.findIndex((item) => item.task.id === task.id) !== 0}
                                                                canOutdent={Boolean(task.parent)}
                                                            />
                                                        </Box>
                                                    </Flex>

                                                    <Button
                                                        size='xs'
                                                        variant='outline'
                                                        borderColor='var(--control-border)'
                                                        color='var(--text-soft)'
                                                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                        data-tooltip-disabled='true'
                                                        loading={(addToTodayMutation.isPending && addToTodayMutation.variables === task.id) || (removeFromTodayMutation.isPending && removeFromTodayMutation.variables === dailyTaskIds.get(task.id))}
                                                        onClick={() => {
                                                            const dailyTaskId = dailyTaskIds.get(task.id);
                                                            if (dailyTaskId) removeFromTodayMutation.mutate(dailyTaskId);
                                                            else addToTodayMutation.mutate(task.id);
                                                        }}
                                                    >
                                                        <CalendarPlus size={13} />
                                                        <Box as='span' ml={1}>{dailyTaskIds.has(task.id) ? 'Remove from My day' : 'My day'}</Box>
                                                    </Button>
                                                </Stack>
                                            </Flex>
                                        </DroppableTaskContainer>
                                    );
                                })}
                                <DragOverlay>
                                    {activeDragRow ? (
                                        <Box
                                            border='1px solid'
                                            borderColor='var(--panel-border)'
                                            bg='var(--panel-bg)'
                                            borderRadius='10px'
                                            px={3}
                                            py={3}
                                            boxShadow='lg'
                                            minW={{ base: '240px', md: '460px' }}
                                        >
                                            <Flex align='center' gap={2}>
                                                <GripVertical size={14} color='var(--text-muted)' />
                                                <Text flex='1' fontWeight='medium' color='var(--app-text)'>{activeDragRow.task.title}</Text>
                                                <Text fontSize='xs' color='var(--text-muted)'>Status: {activeDragRow.task.completed ? 'Complete' : 'Open'}</Text>
                                            </Flex>
                                        </Box>
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
                        )}
                    </Stack>
                </Box>

                <Box borderTop='1px solid' borderColor='var(--panel-border)' pt={8}>
                    <Heading as='h3' size='md' mb={4}>Notes</Heading>

                    <Stack gap={4} maxH={{ base: 'none', xl: 'calc(100vh - 285px)' }} overflowY='auto' pr={1}>
                        {notes.length === 0 ? (
                            <Text color='var(--text-muted)'>No notes yet for this project.</Text>
                        ) : (
                            notes.map((note) => {
                                const isEditing = editingNoteId === note.id;

                                return (
                                    <Box key={note.id} border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={3}>
                                        {isEditing ? (
                                            <Stack gap={3}>
                                                <Input
                                                    value={draftNoteTitle}
                                                    onChange={(event) => setDraftNoteTitle(event.target.value)}
                                                    placeholder='Note title'
                                                    bg='var(--control-bg)'
                                                    color='var(--control-text)'
                                                    borderColor='var(--control-border)'
                                                />
                                                <Textarea
                                                    value={draftNoteBody}
                                                    onChange={(event) => setDraftNoteBody(event.target.value)}
                                                    minH='120px'
                                                    placeholder='Write something useful…'
                                                    bg='var(--control-bg)'
                                                    color='var(--control-text)'
                                                    borderColor='var(--control-border)'
                                                />
                                                <Flex gap={2}>
                                                    <Button
                                                        bg='var(--accent)'
                                                        color='white'
                                                        _hover={{ bg: 'var(--accent-soft)' }}
                                                        onClick={() => updateNoteMutation.mutate()}
                                                        loading={updateNoteMutation.isPending}
                                                    >
                                                        <Save size={14} />
                                                        <Box as='span' ml={2}>Save</Box>
                                                    </Button>
                                                    <Button variant='outline' bg='var(--panel-bg)' borderColor='var(--control-border)' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => {
                                                        setEditingNoteId(null);
                                                        setDraftNoteTitle('');
                                                        setDraftNoteBody('');
                                                    }}>
                                                        Cancel
                                                    </Button>
                                                </Flex>
                                            </Stack>
                                        ) : (
                                            <>
                                                <Flex justify='space-between' align='flex-start' gap={3}>
                                                    <Heading as='h4' size='sm' mb={2}>{note.title}</Heading>
                                                    <Flex gap={2}>
                                                        <Button
                                                            variant='outline'
                                                            size='sm'
                                                            bg='var(--panel-bg)'
                                                            borderColor='var(--control-border)'
                                                            color='var(--text-soft)'
                                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                            onClick={() => {
                                                                setEditingNoteId(note.id);
                                                                setDraftNoteTitle(note.title);
                                                                setDraftNoteBody(note.body);
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant='outline'
                                                            size='sm'
                                                            bg='var(--panel-bg)'
                                                            borderColor='red.300'
                                                            color='red.600'
                                                            _hover={{ bg: 'red.50', color: 'red.700' }}
                                                            data-tooltip-disabled='true'
                                                            onClick={() => deleteNoteMutation.mutate(note.id)}
                                                            loading={deleteNoteMutation.isPending}
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </Flex>
                                                </Flex>
                                                <Text color='var(--text-soft)' whiteSpace='pre-wrap'>{note.body || 'No content yet.'}</Text>
                                            </>
                                        )}
                                    </Box>
                                );
                            })
                        )}

                        <Box borderTop='1px solid' borderColor='var(--panel-border)' pt={4} position={{ xl: 'sticky' }} bottom={{ xl: '0' }} bg='var(--app-bg)' pb={1}>
                            <Flex align='center' gap={2} mb={3}>
                                <FileText size={16} />
                                <Text fontWeight='semibold'>New note</Text>
                            </Flex>

                            <Stack gap={3}>
                                <Input
                                    value={newNoteTitle}
                                    onChange={(event) => setNewNoteTitle(event.target.value)}
                                    placeholder='Note title'
                                    bg='var(--control-bg)'
                                    color='var(--control-text)'
                                    borderColor='var(--control-border)'
                                />
                                <Textarea
                                    value={newNoteBody}
                                    onChange={(event) => setNewNoteBody(event.target.value)}
                                    placeholder='Write something useful…'
                                    minH='120px'
                                    bg='var(--control-bg)'
                                    color='var(--control-text)'
                                    borderColor='var(--control-border)'
                                />
                                <Button
                                    bg='var(--accent)'
                                    color='white'
                                    _hover={{ bg: 'var(--accent-soft)' }}
                                    onClick={() => {
                                        const title = newNoteTitle.trim();
                                        const body = newNoteBody.trim();
                                        if (!body && !title) return;
                                        createNoteMutation.mutate();
                                    }}
                                    loading={createNoteMutation.isPending}
                                >
                                    <Save size={14} />
                                    <Box as='span' ml={2}>Save note</Box>
                                </Button>
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            </Stack>
        </Stack>
    );
}

export default ProjectDetailPage;
