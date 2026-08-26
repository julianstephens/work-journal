import { Box, Button, Flex, Heading, Input, Stack, Text, Textarea } from '@chakra-ui/react';
import { createHighlighter } from '@tanstack/highlight/core';
import { html } from '@tanstack/highlight/languages/html';
import { js } from '@tanstack/highlight/languages/js';
import { json } from '@tanstack/highlight/languages/json';
import { jsx } from '@tanstack/highlight/languages/jsx';
import { markdown } from '@tanstack/highlight/languages/markdown';
import { plaintext } from '@tanstack/highlight/languages/plaintext';
import { python } from '@tanstack/highlight/languages/python';
import { shell } from '@tanstack/highlight/languages/shell';
import { ts } from '@tanstack/highlight/languages/ts';
import { tsx } from '@tanstack/highlight/languages/tsx';
import { yaml } from '@tanstack/highlight/languages/yaml';
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown';
import { createThemeCss } from '@tanstack/highlight/theme';
import type { CodeHighlighter } from '@tanstack/markdown';
import { Markdown } from '@tanstack/markdown/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, FilePlus2, FileText, Folder, FolderTree, PanelLeftClose, PanelLeftOpen, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/auth-context';
import {
    makeUserScopedStorageKey,
    readStoredBoolean,
    readStoredJson,
    writeStoredBoolean,
    writeStoredJson,
} from '../../lib/local-storage';
import { queryKeys } from '../../lib/query-keys';
import { useProjects } from '../projects/useProjects';
import { createNote, deleteNote, listNotes, updateNote } from './api';

type GroupedNotes = {
    projectId: string | null;
    label: string;
    notes: ReturnType<typeof listNotes> extends Promise<infer T> ? T : never;
};

type WorkspaceTab = 'edit' | 'preview';

function formatRecordTimestamp(value: unknown): string | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toLocaleString();
    }

    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const candidates = [
        trimmed,
        // PocketBase often stores datetime with a space instead of "T".
        trimmed.replace(' ', 'T'),
        trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`,
        trimmed.replace(' ', 'T').endsWith('Z') ? trimmed.replace(' ', 'T') : `${trimmed.replace(' ', 'T')}Z`,
    ];

    for (const candidate of candidates) {
        const parsed = Date.parse(candidate);
        if (Number.isNaN(parsed)) continue;
        return new Date(parsed).toLocaleString();
    }

    // Show raw backend value as a final fallback instead of hiding metadata.
    return trimmed;
}

function readRecordField(record: unknown, key: string): unknown {
    if (!record || typeof record !== 'object') return undefined;

    const direct = (record as Record<string, unknown>)[key];
    if (direct !== undefined) return direct;

    const getter = (record as { get?: (field: string) => unknown; }).get;
    if (typeof getter === 'function') {
        return getter(key);
    }

    return undefined;
}

const noteMarkdownHighlighter = createHighlighter({
    languages: [plaintext, markdown, html, js, jsx, json, python, shell, ts, tsx, yaml],
});

const highlightMarkdownCodeBase = createTanStackMarkdownHighlighter(noteMarkdownHighlighter);

function normalizeFenceLanguage(lang: string | undefined): string | undefined {
    if (!lang) return lang;
    const normalized = lang.toLowerCase();

    const aliases: Record<string, string> = {
        javascript: 'js',
        typescript: 'ts',
        sh: 'shell',
        bash: 'shell',
        zsh: 'shell',
        yml: 'yaml',
        py: 'python',
        text: 'plaintext',
        txt: 'plaintext',
        md: 'markdown',
    };

    return aliases[normalized] ?? normalized;
}

const highlightMarkdownCode: CodeHighlighter = (code, lang, options) => {
    return highlightMarkdownCodeBase(code, normalizeFenceLanguage(lang), options);
};

const noteMarkdownAppTheme = {
    name: 'work-journal-theme',
    type: 'light' as const,
    background: 'var(--panel-bg)',
    foreground: 'var(--app-text)',
    tokens: {
        token: 'var(--app-text)',
        attr: 'var(--text-soft)',
        'code-inline': 'var(--app-text)',
        command: 'var(--text-soft)',
        comment: 'var(--text-muted)',
        deleted: '#b42318',
        function: 'var(--accent)',
        heading: 'var(--accent)',
        inserted: '#157347',
        keyword: 'var(--accent-soft)',
        link: 'var(--accent)',
        literal: 'var(--accent-soft)',
        meta: 'var(--text-muted)',
        number: 'var(--accent-soft)',
        operator: 'var(--text-soft)',
        property: 'var(--app-text)',
        selector: 'var(--accent-soft)',
        string: '#2f7d32',
        tag: 'var(--accent)',
        type: 'var(--accent-soft)',
        variable: 'var(--app-text)',
    },
};

const noteMarkdownThemeCss = createThemeCss({
    themes: [{
        selector: '.markdown-renderer',
        theme: noteMarkdownAppTheme,
    }],
    codeBlockSelector: '.markdown-renderer pre.tm-code',
    lineNumbersSelector: '.markdown-renderer .tm-code--line-numbers',
});

function NotesPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: projects = [] } = useProjects();
    const { data: notes = [], isLoading } = useQuery({ queryKey: queryKeys.notes.all, queryFn: listNotes });
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftBody, setDraftBody] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [tab, setTab] = useState<WorkspaceTab>('edit');
    const explorerCollapsedStorageKey = useMemo(() => makeUserScopedStorageKey('ui.notes.explorer.collapsed', user?.id), [user?.id]);
    const explorerFoldersStorageKey = useMemo(() => makeUserScopedStorageKey('ui.notes.explorer.expandedFolders', user?.id), [user?.id]);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => readStoredJson<Record<string, boolean>>(explorerFoldersStorageKey, {}));
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(() => readStoredBoolean(explorerCollapsedStorageKey, false));

    const notesById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
    const selectedNote = selectedNoteId ? notesById.get(selectedNoteId) ?? null : null;

    const groupedNotes = useMemo<GroupedNotes[]>(() => {
        const byProject = new Map<string | null, typeof notes>();

        notes.forEach((note) => {
            const key = note.project ?? null;
            const existing = byProject.get(key);
            if (!existing) byProject.set(key, [note]);
            else existing.push(note);
        });

        const groups: GroupedNotes[] = projects
            .map((project) => ({
                projectId: project.id,
                label: project.name,
                notes: byProject.get(project.id) ?? [],
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        // Notes can reference a project that is no longer available in the current
        // project query result; keep those visible by treating them as uncategorized.
        const knownProjectIds = new Set(projects.map((project) => project.id));
        const orphanedNotes = Array.from(byProject.entries())
            .filter(([projectId]) => projectId !== null && !knownProjectIds.has(projectId))
            .flatMap(([, projectNotes]) => projectNotes);

        groups.push({
            projectId: null,
            label: 'Uncategorized',
            notes: [...(byProject.get(null) ?? []), ...orphanedNotes],
        });

        return groups;
    }, [notes, projects]);

    useEffect(() => {
        setIsTreeCollapsed(readStoredBoolean(explorerCollapsedStorageKey, false));
    }, [explorerCollapsedStorageKey]);

    useEffect(() => {
        setExpandedFolders(readStoredJson<Record<string, boolean>>(explorerFoldersStorageKey, {}));
    }, [explorerFoldersStorageKey]);

    useEffect(() => {
        writeStoredBoolean(explorerCollapsedStorageKey, isTreeCollapsed);
    }, [explorerCollapsedStorageKey, isTreeCollapsed]);

    useEffect(() => {
        writeStoredJson(explorerFoldersStorageKey, expandedFolders);
    }, [expandedFolders, explorerFoldersStorageKey]);

    useEffect(() => {
        setExpandedFolders((current) => {
            const next = { ...current };
            let changed = false;

            groupedNotes.forEach((group) => {
                const key = group.projectId ?? 'uncategorized';
                if (key in next) return;
                next[key] = true;
                changed = true;
            });

            return changed ? next : current;
        });
    }, [groupedNotes]);

    useEffect(() => {
        if (notes.length === 0) {
            setSelectedNoteId(null);
            setDraftTitle('');
            setDraftBody('');
            setIsDirty(false);
            setSaveError(null);
            return;
        }

        if (!selectedNoteId || !notesById.has(selectedNoteId)) {
            const firstNote = notes[0];
            setSelectedNoteId(firstNote.id);
            setDraftTitle(firstNote.title);
            setDraftBody(firstNote.body);
            setIsDirty(false);
            setSaveError(null);
            return;
        }

        if (!isDirty) {
            const fresh = notesById.get(selectedNoteId);
            if (!fresh) return;
            setDraftTitle(fresh.title);
            setDraftBody(fresh.body);
        }
    }, [isDirty, notes, notesById, selectedNoteId]);

    const updateMutation = useMutation({
        mutationFn: ({ noteId, title, body }: { noteId: string; title: string; body: string; }) => updateNote(noteId, { title, body }),
        onSuccess: (updatedNote) => {
            queryClient.setQueryData(queryKeys.notes.all, (previous: typeof notes | undefined) => {
                if (!previous) return [updatedNote];
                return previous.map((note) => {
                    if (note.id !== updatedNote.id) return note;
                    return {
                        ...note,
                        ...updatedNote,
                        created: note.created || updatedNote.created,
                        updated: updatedNote.updated || note.updated,
                    };
                });
            });
            setSaveError(null);
        },
    });

    const saveCurrentDraft = useCallback(async (): Promise<boolean> => {
        if (!selectedNote) return true;
        if (!isDirty) return true;

        const nextTitle = draftTitle.trim() || 'Untitled note';
        const nextBody = draftBody;
        const titleUnchanged = nextTitle === selectedNote.title;
        const bodyUnchanged = nextBody === selectedNote.body;

        if (titleUnchanged && bodyUnchanged) {
            setIsDirty(false);
            setSaveError(null);
            return true;
        }

        try {
            await updateMutation.mutateAsync({
                noteId: selectedNote.id,
                title: nextTitle,
                body: nextBody,
            });
            setDraftTitle(nextTitle);
            setIsDirty(false);
            return true;
        } catch {
            setSaveError('Could not save note changes. Try again.');
            return false;
        }
    }, [draftBody, draftTitle, isDirty, selectedNote, updateMutation]);

    const switchTab = useCallback(async (nextTab: WorkspaceTab) => {
        if (nextTab === tab) return;
        const canContinue = await saveCurrentDraft();
        if (!canContinue) return;
        setTab(nextTab);
    }, [saveCurrentDraft, tab]);

    useEffect(() => {
        const handleKeydown = (event: KeyboardEvent) => {
            if (!selectedNote) return;

            const isToggleShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v';
            if (!isToggleShortcut) return;

            event.preventDefault();
            void switchTab(tab === 'edit' ? 'preview' : 'edit');
        };

        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, [selectedNote, switchTab, tab]);

    const createMutation = useMutation({
        mutationFn: ({ projectId }: { projectId: string | null; }) => createNote({
            title: 'Untitled note',
            body: '',
            project: projectId,
        }),
        onSuccess: (note) => {
            queryClient.setQueryData(queryKeys.notes.all, (previous: typeof notes | undefined) => {
                if (!previous) return [note];
                return [note, ...previous.filter((existing) => existing.id !== note.id)];
            });
            setSelectedNoteId(note.id);
            setDraftTitle(note.title);
            setDraftBody(note.body);
            setIsDirty(false);
            setSaveError(null);
            setTab('edit');
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            if (note.project) queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(note.project) });
        },
    });

    const createFromTree = async (projectId: string | null) => {
        createMutation.mutate({ projectId });
    };

    const deleteMutation = useMutation({
        mutationFn: ({ noteId }: { noteId: string; }) => deleteNote(noteId),
        onSuccess: (_, { noteId }) => {
            queryClient.setQueryData(queryKeys.notes.all, (previous: typeof notes | undefined) => {
                if (!previous) return [];
                return previous.filter((note) => note.id !== noteId);
            });

            if (selectedNoteId === noteId) {
                setSelectedNoteId(null);
            }

            const deleted = notesById.get(noteId);
            if (deleted?.project) {
                queryClient.invalidateQueries({ queryKey: queryKeys.notes.project(deleted.project) });
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
        },
    });

    const selectNote = async (noteId: string) => {
        if (noteId === selectedNoteId) return;
        const canContinue = await saveCurrentDraft();
        if (!canContinue) return;

        const next = notesById.get(noteId);
        if (!next) return;

        setSelectedNoteId(next.id);
        setDraftTitle(next.title);
        setDraftBody(next.body);
        setIsDirty(false);
        setSaveError(null);
    };

    const selectedCreatedRaw = selectedNote?.created
        ?? readRecordField(selectedNote, 'created')
        ?? readRecordField(selectedNote, 'createdAt')
        ?? readRecordField(selectedNote, 'created_at');
    const selectedUpdatedRaw = selectedNote?.updated
        ?? readRecordField(selectedNote, 'updated')
        ?? readRecordField(selectedNote, 'updatedAt')
        ?? readRecordField(selectedNote, 'updated_at');
    const createdLabel = formatRecordTimestamp(selectedCreatedRaw);
    const updatedLabel = formatRecordTimestamp(selectedUpdatedRaw);
    return (
        <Stack gap={8} maxW='1200px' mx={{ xl: 'auto' }}>
            <Box>
                <Heading as='h2' fontSize={{ base: '3xl', md: '4xl' }} lineHeight='1.05' letterSpacing='-0.04em'>Notes</Heading>
                <Text color='var(--text-muted)' mt={2}>Browse notes by project and edit with markdown preview.</Text>
            </Box>

            <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align='stretch'>
                <Box
                    border='1px solid'
                    borderColor='var(--control-border)'
                    borderRadius='10px'
                    bg='var(--panel-bg)'
                    p={isTreeCollapsed ? 2 : 4}
                    w={{ base: 'full', lg: isTreeCollapsed ? '56px' : '300px' }}
                    transition='width 0.2s ease'
                    overflow='hidden'
                >
                    <Flex align='center' justify={isTreeCollapsed ? 'center' : 'space-between'} mb={isTreeCollapsed ? 0 : 4}>
                        {!isTreeCollapsed ? <Flex align='center' gap={2} color='var(--text-soft)' minW='0'>
                            <FolderTree size={17} />
                            <Text fontWeight='700'>Explorer</Text>
                        </Flex> : null}
                        <Button
                            size='sm'
                            variant='outline'
                            bg='var(--panel-bg)'
                            borderColor='var(--control-border)'
                            color='var(--text-soft)'
                            data-tooltip-content={isTreeCollapsed ? 'Show explorer' : 'Hide explorer (focus mode)'}
                            aria-label={isTreeCollapsed ? 'Show explorer' : 'Hide explorer (focus mode)'}
                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                            onClick={() => setIsTreeCollapsed((current) => !current)}
                            flexShrink={0}
                        >
                            {isTreeCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                        </Button>
                    </Flex>

                    {isTreeCollapsed ? null : (isLoading ? <Text color='var(--text-muted)'>Loading notes…</Text> : (
                        <Stack gap={4} maxH={{ base: 'none', lg: 'calc(100vh - 290px)' }} overflowY='auto' pr={1}>
                            {groupedNotes.map((group) => {
                                const folderKey = group.projectId ?? 'uncategorized';
                                const isExpanded = expandedFolders[folderKey] ?? true;

                                return (
                                    <Box key={folderKey}>
                                        <Flex align='center' gap={1}>
                                            <Button
                                                onClick={() => {
                                                    setExpandedFolders((current) => ({
                                                        ...current,
                                                        [folderKey]: !(current[folderKey] ?? true),
                                                    }));
                                                }}
                                                data-tooltip-content={group.label}
                                                variant='ghost'
                                                justifyContent='flex-start'
                                                h='30px'
                                                px={2}
                                                flex='1'
                                                _hover={{ bg: 'var(--panel-bg-soft)' }}
                                            >
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                <Folder size={14} />
                                                <Box as='span' ml={1.5} fontWeight='700' color='var(--text-soft)' truncate>{group.label}</Box>
                                                <Box as='span' ml={2} fontSize='xs' color='var(--text-muted)'>({group.notes.length})</Box>
                                            </Button>
                                            <Button type='button' size='xs' variant='ghost' color='var(--text-soft)' data-tooltip-disabled='true' _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }} onClick={() => { void createFromTree(group.projectId); }}>
                                                <FilePlus2 size={12} />
                                            </Button>
                                        </Flex>

                                        {isExpanded ? (
                                            group.notes.length === 0 ? (
                                                <Text fontSize='sm' color='var(--text-muted)' pl={8} py={1.5}>No files</Text>
                                            ) : (
                                                <Stack gap={0.5} pl={6} ml={2} mt={1} borderLeft='1px solid' borderColor='var(--panel-border)'>
                                                    {group.notes.map((note) => {
                                                        const isSelected = note.id === selectedNoteId;

                                                        return (
                                                            <Flex key={note.id} align='center' gap={1}>
                                                                <Button
                                                                    data-tooltip-content='Open note'
                                                                    justifyContent='flex-start'
                                                                    variant='ghost'
                                                                    h='32px'
                                                                    py={1.5}
                                                                    px={2}
                                                                    flex='1'
                                                                    bg={isSelected ? 'var(--panel-bg-soft)' : 'transparent'}
                                                                    color={isSelected ? 'var(--app-text)' : 'var(--text-soft)'}
                                                                    border='1px solid'
                                                                    borderColor={isSelected ? 'var(--control-border)' : 'transparent'}
                                                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                                                    onClick={() => { void selectNote(note.id); }}
                                                                >
                                                                    <FileText size={13} />
                                                                    <Box as='span' ml={1.5} truncate>{note.title}</Box>
                                                                </Button>
                                                                <Button
                                                                    aria-label='Delete note'
                                                                    data-tooltip-content='Delete note'
                                                                    size='xs'
                                                                    variant='ghost'
                                                                    color='red.500'
                                                                    minW='28px'
                                                                    h='28px'
                                                                    _hover={{ bg: 'red.50', color: 'red.600' }}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        deleteMutation.mutate({ noteId: note.id });
                                                                    }}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </Button>
                                                            </Flex>
                                                        );
                                                    })}
                                                </Stack>
                                            )
                                        ) : null}
                                    </Box>
                                );
                            })}
                        </Stack>
                    ))}
                </Box>

                <Box border='1px solid' borderColor='var(--control-border)' borderRadius='10px' bg='var(--panel-bg)' p={4} flex='1' minH='520px' minW='0' overflow='hidden'>

                    {!selectedNote ? (
                        <Flex h='100%' align='center' justify='center' direction='column' gap={3} w='100%' maxW='900px' mx='auto' minW='0'>
                            <Text fontWeight='600'>Select a note to start editing.</Text>
                            <Button type='button' bg='var(--accent)' color='white' data-tooltip-disabled='true' _hover={{ bg: 'var(--accent-soft)' }} onClick={() => { void createFromTree(null); }}>
                                <FilePlus2 size={14} />
                                <Box as='span' ml={1.5}>Create note</Box>
                            </Button>
                        </Flex>
                    ) : (
                        <Stack gap={4} h='100%' w='100%' maxW='900px' mx='auto' minW='0'>
                            <Flex align='center' justify='space-between' gap={3}>
                                <Input
                                    value={draftTitle}
                                    onChange={(event) => {
                                        setDraftTitle(event.target.value);
                                        setIsDirty(true);
                                        setSaveError(null);
                                    }}
                                    onBlur={() => { void saveCurrentDraft(); }}
                                    placeholder='Note title'
                                    bg='var(--control-bg)'
                                    borderColor='var(--control-border)'
                                    fontWeight='700'
                                    fontSize='lg'
                                />
                                <Flex align='center' gap={2}>
                                    {saveError ? <Text fontSize='xs' color='red.600' whiteSpace='nowrap'>{saveError}</Text> : null}
                                    {tab === 'edit' ? (
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            bg='var(--panel-bg)'
                                            borderColor='var(--control-border)'
                                            color='var(--text-soft)'
                                            data-tooltip-content='Switch to preview mode'
                                            aria-label='Switch to preview mode'
                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                            onClick={() => { void switchTab('preview'); }}
                                        >
                                            <Eye size={14} />
                                        </Button>
                                    ) : (
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            bg='var(--panel-bg)'
                                            borderColor='var(--control-border)'
                                            color='var(--text-soft)'
                                            data-tooltip-content='Switch to edit mode'
                                            aria-label='Switch to edit mode'
                                            _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                            onClick={() => { void switchTab('edit'); }}
                                        >
                                            <Pencil size={14} />
                                        </Button>
                                    )}
                                </Flex>
                            </Flex>

                            <Flex align='center' justify='space-between' gap={3} w='full'>
                                <Text fontSize='xs' color='var(--text-muted)'>
                                    {`Created: ${createdLabel ?? 'Not available'} · Updated: ${updatedLabel ?? 'Not available'}`}
                                </Text>
                                <Text fontSize='xs' color='var(--text-muted)' fontWeight='500' letterSpacing='0.02em' whiteSpace='nowrap'>
                                    {isDirty ? 'Editing' : 'Saved'}
                                </Text>
                            </Flex>

                            {tab === 'edit' ? (
                                <Textarea
                                    value={draftBody}
                                    onChange={(event) => {
                                        setDraftBody(event.target.value);
                                        setIsDirty(true);
                                        setSaveError(null);
                                    }}
                                    onBlur={() => { void saveCurrentDraft(); }}
                                    placeholder='Write markdown here…'
                                    minH='380px'
                                    h='full'
                                    resize='vertical'
                                    bg='var(--control-bg)'
                                    borderColor='var(--control-border)'
                                />
                            ) : (
                                <Box
                                    className='markdown-renderer'
                                    border='1px solid'
                                    borderColor='var(--panel-border)'
                                    borderRadius='8px'
                                    bg='var(--control-bg)'
                                    p={4}
                                    minH='380px'
                                    minW='0'
                                    overflow='auto'
                                    css={{
                                        '& h1, & h2, & h3, & h4': {
                                            fontWeight: '700',
                                            lineHeight: '1.25',
                                            mt: 4,
                                            mb: 2,
                                        },
                                        '& h1': { fontSize: '2xl' },
                                        '& h2': { fontSize: 'xl' },
                                        '& h3': { fontSize: 'lg' },
                                        '& p': {
                                            lineHeight: '1.7',
                                            mb: 3,
                                        },
                                        '& ul, & ol': {
                                            pl: 6,
                                            mb: 3,
                                        },
                                        '& ul': { listStyleType: 'disc' },
                                        '& ol': { listStyleType: 'decimal' },
                                        '& li': { mb: 1 },
                                        '& a': {
                                            color: 'var(--accent)',
                                            textDecoration: 'underline',
                                        },
                                        '& strong': { fontWeight: '700' },
                                        '& em': { fontStyle: 'italic' },
                                        '& blockquote': {
                                            borderLeft: '3px solid var(--panel-border)',
                                            pl: 3,
                                            color: 'var(--text-soft)',
                                            my: 3,
                                        },
                                        '& code': {
                                            bg: 'var(--panel-bg)',
                                            border: '1px solid var(--panel-border)',
                                            borderRadius: '4px',
                                            px: 1,
                                            py: 0.5,
                                            fontSize: '0.92em',
                                        },
                                        '& pre': {
                                            bg: 'var(--panel-bg)',
                                            border: '1px solid var(--panel-border)',
                                            borderRadius: '8px',
                                            p: 3,
                                            overflowX: 'auto',
                                            mb: 3,
                                        },
                                        '& pre code': {
                                            bg: 'transparent',
                                            border: 'none',
                                            p: 0,
                                        },
                                    }}
                                >
                                    <style>{noteMarkdownThemeCss}</style>
                                    <Markdown highlighter={highlightMarkdownCode} codeLineNumbers>
                                        {draftBody.trim() ? draftBody : 'No markdown content yet.'}
                                    </Markdown>
                                </Box>
                            )}
                        </Stack>
                    )}
                </Box>
            </Flex>
        </Stack>
    );
}

export default NotesPage;
