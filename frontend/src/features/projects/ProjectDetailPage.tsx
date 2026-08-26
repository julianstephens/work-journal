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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { queryKeys } from '../../lib/query-keys';
import { createNote, deleteNote, listNotesForProject, updateNote } from '../notes/api';
import { createTask, listTasksForProject } from '../tasks/api';
import { listProjects } from './api';
import { addTaskToToday, listToday, removeTaskFromToday } from '../today/api';

function getLocalIsoDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
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
    const todayDate = useMemo(() => getLocalIsoDate(), []);

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
        mutationFn: (title: string) => createTask({ title, project: projectId ?? null }),
        onSuccess: () => {
            setNewTaskTitle('');
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(projectId ?? 'missing') });
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
    const tasks = tasksQuery.data ?? [];
    const notes = notesQuery.data ?? [];
    const dailyTaskIds = useMemo(() => new Map((todayQuery.data ?? []).map((item) => [item.task.id, item.id])), [todayQuery.data]);

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
                                createTaskMutation.mutate(title);
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
                            tasks.map((task) => (
                                <Box key={task.id} borderBottom='1px solid' borderColor='var(--panel-border)' py={3} px={2}>
                                    <Flex justify='space-between' gap={3} align='center'>
                                        <Box>
                                            <Text fontWeight='medium'>{task.title}</Text>
                                            <Text color='var(--text-muted)' fontSize='sm'>Status: {task.completed ? 'Complete' : 'Open'}</Text>
                                        </Box>
                                        <Button
                                            size='xs'
                                            variant='outline'
                                            borderColor='var(--control-border)'
                                            color='var(--text-soft)'
                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
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
                                    </Flex>
                                </Box>
                            ))
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
                                                    <Button variant='ghost' colorScheme='gray' onClick={() => {
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
                                                            variant='ghost'
                                                            size='sm'
                                                            colorScheme='gray'
                                                            onClick={() => {
                                                                setEditingNoteId(note.id);
                                                                setDraftNoteTitle(note.title);
                                                                setDraftNoteBody(note.body);
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant='ghost'
                                                            size='sm'
                                                            colorScheme='red'
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
