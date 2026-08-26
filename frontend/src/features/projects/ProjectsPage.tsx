import {
    Box,
    Button,
    Flex,
    Heading,
    Input,
    SimpleGrid,
    Stack,
    Text,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
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
        <Stack gap={6} maxW='980px'>
            <Flex justify='space-between' align='center' gap={4}>
                <Heading as='h2' size='lg'>Projects</Heading>
                <Flex gap={2} align='center'>
                    <Input
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder='Project name'
                        w='220px'
                        bg='var(--control-bg)'
                        color='var(--control-text)'
                        borderColor='var(--control-border)'
                    />
                    <Button
                        variant='outline'
                        colorScheme='gray'
                        onClick={() => {
                            const value = projectName.trim();
                            if (!value) return;
                            createMutation.mutate(value);
                        }}
                        loading={createMutation.isPending}
                    >
                        <FolderPlus size={16} />
                        <Box as='span' ml={2}>New project</Box>
                    </Button>
                </Flex>
            </Flex>

            {isLoading ? (
                <Text color='var(--text-muted)'>Loading projects…</Text>
            ) : (
                <SimpleGrid columns={2} gap={4}>
                    {projects.map((project) => (
                        <Box
                            key={project.id}
                            bg='var(--panel-bg)'
                            border='1px solid'
                            borderColor='var(--panel-border)'
                            borderRadius='md'
                            p={5}
                            cursor='pointer'
                            _hover={{ borderColor: 'var(--text-muted)', shadow: 'sm' }}
                            onClick={() => navigate(`/projects/${project.id}`)}
                        >
                            <Text fontSize='xl' fontWeight='semibold'>{project.name}</Text>
                            <Text mt={2} color='var(--text-soft)'>{project.description ?? 'No description yet.'}</Text>
                        </Box>
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
}

export default ProjectsPage;
