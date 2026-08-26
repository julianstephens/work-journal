import {
    Box,
    Button,
    Flex,
    Heading,
    Input,
    List,
    Stack,
    Text,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryKeys } from '../../lib/query-keys';
import { createProject } from './api';
import { useProjects } from './useProjects';

function ProjectsPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { data: projects = [], isLoading } = useProjects();
    const [projectName, setProjectName] = useState('');

    const createMutation = useMutation({
        mutationFn: (name: string) => createProject({ name }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
            setProjectName('');
        },
    });

    return (
        <Stack gap={8} maxW='880px' mx={{ xl: 'auto' }}>
            <Flex justify='space-between' align='center' gap={4}>
                <Box>
                    <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>Projects</Heading>
                    <Text color='var(--text-muted)' mt={2}>Keep related work and notes together.</Text>
                </Box>
            </Flex>

            <Flex gap={3} align='center' border='1px solid' borderColor='var(--control-border)' borderRadius='10px' px={3} py={2} bg='var(--panel-bg)'>
                <Plus size={19} color='var(--accent)' />
                <Input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        const value = projectName.trim();
                        if (value) createMutation.mutate(value);
                    }}
                    placeholder='Create a project'
                    flex='1'
                    border='none'
                    _focus={{ boxShadow: 'none' }}
                    bg='transparent'
                />
                <Button bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} borderRadius='7px' onClick={() => {
                    const value = projectName.trim();
                    if (value) createMutation.mutate(value);
                }} loading={createMutation.isPending}>
                    <FolderPlus size={15} />
                    <Box as='span' ml={2}>Create</Box>
                </Button>
            </Flex>

            {isLoading ? (
                <Text color='var(--text-muted)'>Loading projects…</Text>
            ) : (
                projects.length === 0 ? <Text color='var(--text-muted)'>No projects yet. Create one to group your work.</Text> : (
                    <List.Root as='ul' listStyle='none' m='0' p='0' borderTop='1px solid' borderColor='var(--panel-border)' maxH={{ base: 'none', md: 'calc(100vh - 305px)' }} overflowY='auto' pr={1}>
                        {projects.map((project, index) => (
                            <List.Item key={project.id} borderBottom='1px solid' borderColor='var(--panel-border)'>
                                <Flex align='center' gap={3} py={4} px={2} cursor='pointer' _hover={{ bg: 'var(--panel-bg-soft)' }} onClick={() => navigate(`/projects/${project.id}`)}>
                                    <Box w='10px' h='10px' borderRadius='full' bg={['#3563e9', '#8b5cf6', '#10a779', '#e5842e', '#dc5b8e'][index % 5]} />
                                    <Box flex='1' minW='0'>
                                        <Text fontWeight='600'>{project.name}</Text>
                                        {project.description ? <Text color='var(--text-muted)' fontSize='sm' mt={0.5} truncate>{project.description}</Text> : null}
                                    </Box>
                                    <ChevronRight size={18} color='var(--text-muted)' />
                                </Flex>
                            </List.Item>
                        ))}
                    </List.Root>
                )
            )}
        </Stack>
    );
}

export default ProjectsPage;
