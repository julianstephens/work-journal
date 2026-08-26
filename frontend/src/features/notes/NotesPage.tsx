import { Box, Button, Flex, Heading, Input, List, Stack, Text, Textarea } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../lib/query-keys';
import { useProjects } from '../projects/useProjects';
import { createNote, listNotes } from './api';

function NotesPage() {
    const queryClient = useQueryClient();
    const { data: projects = [] } = useProjects();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [projectId, setProjectId] = useState('');
    const { data: notes = [], isLoading } = useQuery({ queryKey: queryKeys.notes.all, queryFn: listNotes });
    const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

    const createMutation = useMutation({
        mutationFn: () => createNote({ title: title.trim() || 'Untitled note', body: body.trim(), project: projectId || null }),
        onSuccess: () => {
            setTitle('');
            setBody('');
            setProjectId('');
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            if (projectId) queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(projectId) });
        },
    });

    return (
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Box>
                <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>Notes</Heading>
                <Text color='var(--text-muted)' mt={2}>Ideas, decisions, and useful context in one place.</Text>
            </Box>

            <Box border='1px solid' borderColor='var(--control-border)' borderRadius='10px' p={4} bg='var(--panel-bg)'>
                <Flex align='center' gap={2} mb={3} color='var(--text-soft)'><FilePlus2 size={17} /><Text fontWeight='600'>New note</Text></Flex>
                <Stack gap={3}>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Note title' bg='var(--control-bg)' borderColor='var(--control-border)' />
                    <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder='Write something useful…' minH='110px' bg='var(--control-bg)' borderColor='var(--control-border)' />
                    <Flex justify='space-between' gap={3}>
                        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ maxWidth: '240px', padding: '0 10px', border: '1px solid var(--control-border)', borderRadius: '8px', background: 'var(--control-bg)', color: 'var(--control-text)' }}>
                            <option value=''>No project</option>
                            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
                        <Button bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} onClick={() => { if (title.trim() || body.trim()) createMutation.mutate(); }} loading={createMutation.isPending}>Save note</Button>
                    </Flex>
                </Stack>
            </Box>

            <Box>
                <Text fontSize='sm' fontWeight='700' color='var(--text-soft)' mb={3}>ALL NOTES</Text>
                {isLoading ? <Text color='var(--text-muted)'>Loading notes…</Text> : notes.length === 0 ? <Text color='var(--text-muted)'>No notes yet.</Text> : (
                    <List.Root as='ul' listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 455px)' }} overflowY='auto' pr={1}>
                        {notes.map((note) => (
                            <List.Item key={note.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                <Box py={4} px={2} _hover={{ bg: 'var(--panel-bg-soft)' }}>
                                    <Flex justify='space-between' gap={3} align='baseline'><Text fontWeight='600'>{note.title}</Text>{note.project ? <Text fontSize='xs' color='var(--accent-soft)' whiteSpace='nowrap'>{projectNames.get(note.project) ?? 'Project'}</Text> : null}</Flex>
                                    {note.body ? <Text color='var(--text-soft)' mt={1} lineClamp={2}>{note.body}</Text> : null}
                                </Box>
                            </List.Item>
                        ))}
                    </List.Root>
                )}
            </Box>
        </Stack>
    );
}

export default NotesPage;
