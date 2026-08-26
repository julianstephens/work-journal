import {
    Box,
    Button,
    Flex,
    HStack,
    Heading,
    IconButton,
    Input,
    List,
    ListItem,
    Stack,
    Text,
} from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckBig, FileText, FolderKanban, Home, Inbox, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth-context';
import { createProject } from '../../features/projects/api';
import { useProjects } from '../../features/projects/useProjects';
import { createTask, listInboxTasks, listTasksForProject, toggleTaskCompletion } from '../../features/tasks/api';
import { addTaskToToday, listToday } from '../../features/today/api';
import { queryKeys } from '../../lib/query-keys';
import { CommandPalette, type CommandPaletteItem } from '../command/CommandPalette';

const primaryNav = [
    { to: '/today', label: 'My day', icon: Home },
    { to: '/inbox', label: 'Inbox', icon: Inbox },
    { to: '/notes', label: 'Notes', icon: FileText },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
];

const projectColors = ['#3563e9', '#8b5cf6', '#10a779', '#e5842e', '#dc5b8e', '#2b9bb8'];

type AppDialog =
    | { type: 'task'; }
    | { type: 'project'; }
    | { type: 'notice'; message: string; };

function getLocalIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function AppShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { logout } = useAuth();
    const { data: projects = [], isLoading } = useProjects();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [dialog, setDialog] = useState<AppDialog | null>(null);
    const [dialogValue, setDialogValue] = useState('');
    const [dialogProjectId, setDialogProjectId] = useState('');
    const [dialogAddToToday, setDialogAddToToday] = useState(false);

    const currentProjectId = useMemo(() => {
        const match = location.pathname.match(/^\/projects\/([^/]+)/);
        return match?.[1] ?? null;
    }, [location.pathname]);

    const handleLogout = useCallback(async () => {
        await logout();
        navigate('/login');
    }, [logout, navigate]);

    const toggleSidebar = useCallback(() => {
        setIsSidebarCollapsed((current) => !current);
    }, []);

    const createTaskForCurrentView = useCallback(async (title?: string, projectId?: string | null, addToToday?: boolean) => {
        const value = title?.trim();
        const isTodayView = location.pathname.startsWith('/today');

        if (!value) {
            setDialog({ type: 'task' });
            setDialogProjectId(currentProjectId ?? '');
            setDialogAddToToday(isTodayView);
            return;
        }

        const shouldAddToToday = addToToday ?? isTodayView;
        const taskProject = currentProjectId ? projectId ?? currentProjectId : projectId ?? null;
        const task = await createTask({ title: value, project: taskProject, parent: null });

        if (shouldAddToToday) {
            const todayDate = getLocalIsoDate();
            await addTaskToToday(todayDate, task.id);
            await queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
        }

        if (isTodayView || location.pathname.startsWith('/inbox') || !currentProjectId) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(currentProjectId) });
    }, [currentProjectId, location.pathname, queryClient]);

    const toggleFirstTaskForCurrentView = useCallback(async () => {
        if (location.pathname.startsWith('/today')) {
            const todayDate = getLocalIsoDate();
            const tasks = await listToday(todayDate);
            const target = tasks.find((item) => !item.task.completed) ?? tasks[0];

            if (!target) {
                setDialog({ type: 'notice', message: 'There are no tasks in My day to toggle yet.' });
                return;
            }

            await toggleTaskCompletion(target.task.id, !target.task.completed);
            await queryClient.invalidateQueries({ queryKey: queryKeys.today.date(todayDate) });
            return;
        }

        if (location.pathname.startsWith('/inbox')) {
            const tasks = await listInboxTasks();
            const target = tasks.find((item) => !item.completed) ?? tasks[0];

            if (!target) {
                setDialog({ type: 'notice', message: 'There are no inbox tasks to toggle yet.' });
                return;
            }

            await toggleTaskCompletion(target.id, !target.completed);
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.inbox() });
            return;
        }

        if (currentProjectId) {
            const tasks = await listTasksForProject(currentProjectId);
            const target = tasks.find((item) => !item.completed) ?? tasks[0];

            if (!target) {
                setDialog({ type: 'notice', message: 'There are no tasks in this project to toggle yet.' });
                return;
            }

            await toggleTaskCompletion(target.id, !target.completed);
            await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.project(currentProjectId) });
            return;
        }

        setDialog({ type: 'notice', message: 'Open My day, Inbox, or a project to toggle a task.' });
    }, [currentProjectId, location.pathname, queryClient]);

    const createProjectCommand = useCallback(async (name?: string) => {
        const value = name?.trim();

        if (!value) {
            setDialog({ type: 'project' });
            return;
        }

        await createProject({ name: value });
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    }, [queryClient]);

    const closeDialog = useCallback(() => {
        setDialog(null);
        setDialogValue('');
        setDialogProjectId('');
        setDialogAddToToday(false);
    }, []);

    const submitDialog = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!dialog || dialog.type === 'notice') return;

        if (dialog.type === 'task') {
            await createTaskForCurrentView(dialogValue, dialogProjectId || null, dialogAddToToday);
        } else {
            await createProjectCommand(dialogValue);
        }
        closeDialog();
    }, [closeDialog, createProjectCommand, createTaskForCurrentView, dialog, dialogAddToToday, dialogProjectId, dialogValue]);

    const commands = useMemo<CommandPaletteItem[]>(() => {
        const baseCommands: CommandPaletteItem[] = [
            {
                id: 'nav-today',
                label: 'Go to Today',
                keywords: ['route', 'navigate', 'day'],
                hint: 'Navigation',
                run: () => navigate('/today'),
            },
            {
                id: 'nav-inbox',
                label: 'Go to Inbox',
                keywords: ['route', 'navigate', 'capture'],
                hint: 'Navigation',
                run: () => navigate('/inbox'),
            },
            {
                id: 'nav-projects',
                label: 'Go to Projects',
                keywords: ['route', 'navigate', 'project'],
                hint: 'Navigation',
                run: () => navigate('/projects'),
            },
            {
                id: 'session-toggle-sidebar',
                label: isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
                keywords: ['layout', 'sidebar', 'panel'],
                hint: 'Session',
                run: toggleSidebar,
            },
            {
                id: 'session-logout',
                label: 'Log out',
                keywords: ['auth', 'session', 'account'],
                hint: 'Session',
                run: handleLogout,
            },
            {
                id: 'tasks-create',
                label: 'Create task in current view',
                keywords: ['task', 'quick add', 'new task'],
                hint: 'Task',
                run: createTaskForCurrentView,
            },
            {
                id: 'tasks-toggle-first',
                label: 'Toggle first open task',
                keywords: ['task', 'done', 'complete', 'check'],
                hint: 'Task',
                run: toggleFirstTaskForCurrentView,
            },
            {
                id: 'projects-create',
                label: 'Create project',
                keywords: ['project', 'new project'],
                hint: 'Project',
                run: createProjectCommand,
            },
        ];

        const projectCommands = projects.map((project) => ({
            id: `open-project-${project.id}`,
            label: `Open project: ${project.name}`,
            keywords: ['project', 'open', project.name],
            hint: 'Project',
            run: () => navigate(`/projects/${project.id}`),
        }));

        return [...baseCommands, ...projectCommands];
    }, [createProjectCommand, createTaskForCurrentView, handleLogout, isSidebarCollapsed, navigate, projects, toggleFirstTaskForCurrentView, toggleSidebar]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) {
                return;
            }

            if (event.key.toLowerCase() !== 'k') {
                return;
            }

            event.preventDefault();
            setIsCommandPaletteOpen((current) => !current);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <Flex minH='100vh' bg='var(--app-bg)' color='var(--app-text)'>
            <Box
                as='aside'
                w={isSidebarCollapsed ? '76px' : '264px'}
                borderRight='1px solid'
                borderColor='var(--panel-border)'
                bg='var(--sidebar-bg)'
                transition='width 0.2s ease'
                px={isSidebarCollapsed ? 3 : 4}
                py={6}
                display='flex'
                flexDirection='column'
            >
                <HStack justify={isSidebarCollapsed ? 'center' : 'space-between'} align='center' mb={8}>
                    {!isSidebarCollapsed ? (
                        <HStack gap={2.5}>
                            <Flex w='30px' h='30px' align='center' justify='center' borderRadius='10px' bg='var(--accent)' color='white'>
                                <CircleCheckBig size={17} />
                            </Flex>
                            <Heading as='h1' flexShrink="0" fontSize='lg' fontWeight='700' letterSpacing='-0.02em'>WorkJournal</Heading>
                        </HStack>
                    ) : null}
                    <HStack gap={2}>
                        {!isSidebarCollapsed ? (
                            <IconButton
                                aria-label='Open command palette'
                                title='Open command palette (Ctrl/Cmd+K)'
                                size='sm'
                                variant='ghost'
                                colorScheme='gray'
                                _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                onClick={() => setIsCommandPaletteOpen(true)}
                            >
                                <Search size={16} />
                            </IconButton>
                        ) : null}
                        <IconButton
                            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            size='sm'
                            variant='ghost'
                            colorScheme='gray'
                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                            onClick={toggleSidebar}
                        >
                            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                        </IconButton>
                    </HStack>
                </HStack>

                {!isSidebarCollapsed ? (
                    <Button onClick={() => void createTaskForCurrentView()} justifyContent='flex-start' w='full' bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} borderRadius='9px' mb={6}>
                        <Plus size={17} />
                        <Box as='span' ml={2}>New task</Box>
                    </Button>
                ) : null}

                <Stack gap={1} mb={6}>
                    {primaryNav.map(({ to, label, icon: Icon }) => (
                        <NavLink key={to} to={to}>
                            {({ isActive }) => (
                                <Button
                                    variant='ghost'
                                    justifyContent={isSidebarCollapsed ? 'center' : 'flex-start'}
                                    w='full'
                                    colorScheme='gray'
                                    title={label}
                                    border='1px solid'
                                    borderColor='transparent'
                                    bg={isActive ? 'var(--accent-muted)' : 'transparent'}
                                    color={isActive ? 'var(--accent-soft)' : 'var(--text-soft)'}
                                    fontWeight={isActive ? '600' : '500'}
                                    borderRadius='8px'
                                    _hover={{ bg: 'var(--panel-bg-soft)' }}
                                >
                                    <Icon size={16} />
                                    {!isSidebarCollapsed ? <Box as='span' ml={2}>{label}</Box> : null}
                                </Button>
                            )}
                        </NavLink>
                    ))}
                </Stack>

                <Box borderTop='1px solid' borderColor='var(--panel-border)' my={4} />

                {!isSidebarCollapsed ? (
                    <>
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
                                projects.map((project, index) => (
                                    <ListItem key={project.id}>
                                        <Button
                                            variant='ghost'
                                            justifyContent='flex-start'
                                            w='full'
                                            color='var(--text-soft)'
                                            size='sm'
                                            borderRadius='8px'
                                            overflow='hidden'
                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                            onClick={() => navigate(`/projects/${project.id}`)}
                                        >
                                            <Box w='9px' h='9px' borderRadius='full' bg={projectColors[index % projectColors.length]} flexShrink={0} />
                                            <Box as='span' ml={2} flex='1' minW='0' textAlign='left' overflow='hidden' textOverflow='ellipsis' whiteSpace='nowrap'>
                                                {project.name}
                                            </Box>
                                        </Button>
                                    </ListItem>
                                ))
                            )}
                        </List.Root>
                    </>
                ) : (
                    <Stack gap={2}>
                        {projects.slice(0, 5).map((project, index) => (
                            <Button
                                key={project.id}
                                variant='ghost'
                                size='sm'
                                title={project.name}
                                _hover={{ bg: 'var(--panel-bg-soft)' }}
                                onClick={() => navigate(`/projects/${project.id}`)}
                            >
                                <Box w='10px' h='10px' borderRadius='full' bg={projectColors[index % projectColors.length]} />
                            </Button>
                        ))}
                    </Stack>
                )}

                <Box mt='auto' pt={5}>
                    <Button
                        variant='ghost'
                        w='full'
                        justifyContent={isSidebarCollapsed ? 'center' : 'flex-start'}
                        colorScheme='gray'
                        _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                        onClick={handleLogout}
                        title='Log out'
                    >
                        <LogOut size={16} />
                        {!isSidebarCollapsed ? <Box as='span' ml={2}>Log out</Box> : null}
                    </Button>
                </Box>
            </Box>

            <Box flex='1' minW='0' px={{ base: 5, md: 10, xl: 14 }} py={{ base: 6, md: 10 }}>
                <Outlet />
            </Box>

            {isCommandPaletteOpen ? (
                <CommandPalette
                    onClose={() => setIsCommandPaletteOpen(false)}
                    commands={commands}
                />
            ) : null}

            {dialog ? (
                <Flex position='fixed' inset='0' zIndex={1300} align='center' justify='center' bg='rgba(0, 0, 0, 0.58)' p={5} onClick={closeDialog}>
                    <Box
                        as={dialog.type === 'notice' ? 'div' : 'form'}
                        w='full'
                        maxW='420px'
                        bg='var(--panel-bg)'
                        border='1px solid'
                        borderColor='var(--panel-border)'
                        borderRadius='14px'
                        boxShadow='0 22px 60px rgba(0, 0, 0, 0.34)'
                        p={6}
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={dialog.type === 'notice' ? undefined : (event) => void submitDialog(event as unknown as React.FormEvent<HTMLFormElement>)}
                    >
                        <Heading as='h2' size='md' letterSpacing='-0.02em'>
                            {dialog.type === 'task' ? 'New task' : dialog.type === 'project' ? 'New project' : 'Nothing to do yet'}
                        </Heading>
                        {dialog.type === 'notice' ? (
                            <Text color='var(--text-soft)' mt={3}>{dialog.message}</Text>
                        ) : (
                            <Input
                                autoFocus
                                value={dialogValue}
                                onChange={(event) => setDialogValue(event.target.value)}
                                placeholder={dialog.type === 'task' ? 'What needs to be done?' : 'Project name'}
                                mt={4}
                                bg='var(--control-bg)'
                                borderColor='var(--control-border)'
                            />
                        )}
                        {dialog.type === 'task' ? (
                            <Box mt={3}>
                                <Text fontSize='sm' color='var(--text-muted)' mb={1.5}>Project (optional)</Text>
                                <select
                                    value={dialogProjectId}
                                    onChange={(event) => setDialogProjectId(event.target.value)}
                                    style={{
                                        width: '100%', height: '40px', padding: '0 12px', border: '1px solid var(--control-border)',
                                        borderRadius: '8px', background: 'var(--control-bg)', color: 'var(--control-text)',
                                    }}
                                >
                                    <option value=''>No project</option>
                                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                </select>
                                <Flex as='label' align='center' gap={2} mt={4} cursor='pointer' color='var(--text-soft)'>
                                    <input
                                        type='checkbox'
                                        checked={dialogAddToToday}
                                        onChange={(event) => setDialogAddToToday(event.target.checked)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                                    />
                                    <Text fontSize='sm'>Add to My day</Text>
                                </Flex>
                            </Box>
                        ) : null}
                        <Flex justify='flex-end' gap={2} mt={6}>
                            <Button type='button' variant='ghost' color='var(--text-soft)' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={closeDialog}>Cancel</Button>
                            <Button type={dialog.type === 'notice' ? 'button' : 'submit'} bg='var(--accent)' color='white' _hover={{ bg: 'var(--accent-soft)' }} onClick={dialog.type === 'notice' ? closeDialog : undefined}>
                                {dialog.type === 'notice' ? 'Got it' : dialog.type === 'task' ? 'Add task' : 'Create project'}
                            </Button>
                        </Flex>
                    </Box>
                </Flex>
            ) : null}
        </Flex>
    );
}

export default AppShell;
