import {
    Box,
    Button,
    Flex,
    HStack,
    Heading,
    IconButton,
    List,
    ListItem,
    Stack,
    Text,
} from '@chakra-ui/react';
import { Home, Inbox, LogOut, Plus, SquareKanban } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth-context';
import { useProjects } from '../../features/projects/useProjects';

const primaryNav = [
    { to: '/today', label: 'Today', icon: Home },
    { to: '/inbox', label: 'Inbox', icon: Inbox },
    { to: '/projects', label: 'Projects', icon: SquareKanban },
];

function AppShell() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { data: projects = [], isLoading } = useProjects();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <Flex minH='100vh' bg='var(--app-bg)' color='var(--app-text)'>
            <Box
                as='aside'
                w='280px'
                borderRight='1px solid'
                borderColor='var(--panel-border)'
                bg='var(--panel-bg)'
                px={4}
                py={5}
            >
                <HStack justify='space-between' align='center' mb={5}>
                    <Heading as='h1' size='md'>Work Journal</Heading>
                    <IconButton aria-label='Create new item' size='sm' variant='outline' colorScheme='gray'>
                        <Plus size={16} />
                    </IconButton>
                </HStack>

                <Stack gap={2} mb={6}>
                    {primaryNav.map(({ to, label, icon: Icon }) => (
                        <NavLink key={to} to={to}>
                            {({ isActive }) => (
                                <Button
                                    variant={isActive ? 'solid' : 'ghost'}
                                    justifyContent='flex-start'
                                    w='full'
                                    colorScheme='gray'
                                >
                                    <Icon size={16} />
                                    <Box as='span' ml={2}>{label}</Box>
                                </Button>
                            )}
                        </NavLink>
                    ))}
                </Stack>

                <Box borderTop='1px solid' borderColor='var(--panel-border)' my={4} />

                <Text fontSize='xs' fontWeight='semibold' letterSpacing='0.08em' color='var(--text-muted)' textTransform='uppercase' mb={3}>
                    Projects
                </Text>

                <List.Root gap={2} as='ul' listStyle='none' m='0' p='0'>
                    {isLoading ? (
                        <ListItem>
                            <Text color='var(--text-muted)'>Loading projects…</Text>
                        </ListItem>
                    ) : projects.length === 0 ? (
                        <ListItem>
                            <Text color='var(--text-muted)'>No projects yet</Text>
                        </ListItem>
                    ) : (
                        projects.map((project) => (
                            <ListItem key={project.id}>
                                <Button
                                    variant='ghost'
                                    justifyContent='flex-start'
                                    w='full'
                                    colorScheme='gray'
                                    size='sm'
                                    onClick={() => navigate(`/projects/${project.id}`)}
                                >
                                    {project.name}
                                </Button>
                            </ListItem>
                        ))
                    )}
                </List.Root>

                <Box mt='auto' pt={5}>
                    <Button variant='ghost' w='full' justifyContent='flex-start' colorScheme='gray' onClick={handleLogout}>
                        <LogOut size={16} />
                        <Box as='span' ml={2}>Log out</Box>
                    </Button>
                </Box>
            </Box>

            <Box flex='1' p={8}>
                <Outlet />
            </Box>
        </Flex>
    );
}

export default AppShell;
