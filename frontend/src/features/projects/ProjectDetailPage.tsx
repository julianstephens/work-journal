import {
    Box,
    Button,
    Flex,
    Heading,
    Input,
    SimpleGrid,
    Stack,
    Text,
    Textarea,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { queryKeys } from '../../lib/query-keys';
import { createNote, deleteNote, listNotesForProject, updateNote } from '../notes/api';
import { createTask, listTasksForProject } from '../tasks/api';
import { listProjects } from './api';

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

    const createTaskMutation = useMutation({
        mutationFn: (title: string) => createTask({ title, project: projectId ?? null }),
        onSuccess: () => {
            setNewTaskTitle('');
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(projectId ?? 'missing') });
        },
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
        <Stack gap={6} maxW='1100px'>
            <Flex align='center' justify='space-between' gap={4}>
                <Flex align='center' gap={3}>
                    <Button variant='ghost' colorScheme='gray' onClick={() => navigate('/projects')} aria-label='Back to projects'>
                        <ArrowLeft size={16} />
                    </Button>
                    <Box>
                        <Text color='var(--text-muted)' fontSize='sm'>Project</Text>
                        <Heading as='h2' size='lg'>{project.name}</Heading>
                    </Box>
                </Flex>
            </Flex>

            <Text color='var(--text-soft)'>{subtitle}</Text>

            <SimpleGrid columns={{ base: 1, xl: 2 }} gap={6}>
                <Box bg='var(--panel-bg)' border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={5}>
                    <Heading as='h3' size='md' mb={4}>Tasks</Heading>

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
                            variant='outline'
                            colorScheme='gray'
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

                    <Stack gap={2}>
                        {tasks.length === 0 ? (
                            <Text color='var(--text-muted)'>No tasks in this project yet.</Text>
                        ) : (
                            tasks.map((task) => (
                                <Box key={task.id} border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={3}>
                                    <Text fontWeight='medium'>{task.title}</Text>
                                    <Text color='var(--text-muted)' fontSize='sm'>Status: {task.completed ? 'Complete' : 'Open'}</Text>
                                </Box>
                            ))
                        )}
                    </Stack>
                </Box>

                <Box bg='var(--panel-bg)' border='1px solid' borderColor='var(--panel-border)' borderRadius='md' p={5}>
                    <Heading as='h3' size='md' mb={4}>Notes</Heading>

                    <Stack gap={4}>
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
                                                        variant='solid'
                                                        colorScheme='gray'
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

                        <Box borderTop='1px solid' borderColor='var(--panel-border)' pt={4}>
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
                                    variant='outline'
                                    colorScheme='gray'
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
            </SimpleGrid>
        </Stack>
    );
}

export default ProjectDetailPage;
