import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_TASK_FILTER_STATE,
    TASK_FILTER_PROJECT_ALL,
    TASK_FILTER_PROJECT_UNASSIGNED,
    type TaskCompletionStatus,
    type TaskFilterState,
    type TaskProjectOption,
    type TaskSortField,
} from './task-filtering';

type TaskFiltersProps = {
    value: TaskFilterState;
    onChange: (next: TaskFilterState) => void;
    projectOptions: TaskProjectOption[];
    contextLabel: string;
    onClearFilters?: () => void;
    showDnDHint?: string | null;
    selectionControls?: React.ReactNode;
};

const completionOptions: Array<{ value: TaskCompletionStatus; label: string; }> = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'completed', label: 'Completed' },
];

const sortFieldOptions: Array<{ value: TaskSortField; label: string; }> = [
    { value: 'manual', label: 'Manual' },
    { value: 'title', label: 'Title' },
    { value: 'created', label: 'Created' },
    { value: 'updated', label: 'Updated' },
];

function getSortFieldLabel(value: TaskSortField): string {
    return sortFieldOptions.find((option) => option.value === value)?.label ?? 'Manual';
}

const filterButtonStyle = {
    size: 'sm' as const,
    variant: 'outline' as const,
    borderColor: 'var(--control-border)',
    bg: 'var(--control-bg)',
    color: 'var(--control-text)',
    _hover: { bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' },
};

export function TaskFilters(props: TaskFiltersProps) {
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!sortMenuRef.current) return;
            if (event.target instanceof Node && sortMenuRef.current.contains(event.target)) return;
            setIsSortMenuOpen(false);
        };

        if (!isSortMenuOpen) return undefined;

        window.addEventListener('mousedown', handlePointerDown);
        return () => window.removeEventListener('mousedown', handlePointerDown);
    }, [isSortMenuOpen]);

    const searchPlaceholder = useMemo(() => `Search ${props.contextLabel.toLowerCase()}`, [props.contextLabel]);
    const isClearable = props.value.sortField !== DEFAULT_TASK_FILTER_STATE.sortField
        || props.value.sortDirection !== DEFAULT_TASK_FILTER_STATE.sortDirection
        || props.value.completionStatus !== DEFAULT_TASK_FILTER_STATE.completionStatus
        || props.value.projectId !== DEFAULT_TASK_FILTER_STATE.projectId
        || props.value.searchQuery.trim() !== DEFAULT_TASK_FILTER_STATE.searchQuery;

    return (
        <Box border='1px solid' borderColor='var(--control-border)' borderRadius='12px' bg='var(--panel-bg)' p={3}>
            <Flex align='center' gap={3} wrap='wrap'>
                <Flex align='center' gap={2} flex='1 1 260px' minW={{ base: '100%', md: '240px' }} border='1px solid' borderColor='var(--control-border)' borderRadius='10px' px={3} py={2} bg='var(--control-bg)'>
                    <Search size={16} color='var(--text-muted)' />
                    <Input
                        value={props.value.searchQuery}
                        onChange={(event) => props.onChange({ ...props.value, searchQuery: event.target.value })}
                        placeholder={searchPlaceholder}
                        border='none'
                        bg='transparent'
                        px={0}
                        color='var(--control-text)'
                        _focusVisible={{ boxShadow: 'none' }}
                        _placeholder={{ color: 'var(--text-muted)' }}
                    />
                </Flex>

                <Box minW={{ base: '100%', sm: '160px' }}>
                    <select
                        value={props.value.completionStatus}
                        onChange={(event) => props.onChange({ ...props.value, completionStatus: event.target.value as TaskCompletionStatus })}
                        aria-label='Completion status'
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid var(--control-border)', borderRadius: '10px', background: 'var(--control-bg)', color: 'var(--control-text)' }}
                    >
                        {completionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </Box>

                <Box minW={{ base: '100%', sm: '200px' }}>
                    <select
                        value={props.value.projectId}
                        onChange={(event) => props.onChange({ ...props.value, projectId: event.target.value })}
                        aria-label='Project filter'
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid var(--control-border)', borderRadius: '10px', background: 'var(--control-bg)', color: 'var(--control-text)' }}
                    >
                        <option value={TASK_FILTER_PROJECT_ALL}>All projects</option>
                        <option value={TASK_FILTER_PROJECT_UNASSIGNED}>Unassigned</option>
                        {props.projectOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                </Box>

                <Box ref={sortMenuRef} position='relative'>
                    <Button
                        type='button'
                        {...filterButtonStyle}
                        aria-label={`Sort by ${getSortFieldLabel(props.value.sortField)}`}
                        onClick={() => setIsSortMenuOpen((current) => !current)}
                    >
                        <ArrowUpDown size={14} />
                        <Text as='span' ml={2}>{getSortFieldLabel(props.value.sortField)}</Text>
                    </Button>
                    {isSortMenuOpen ? (
                        <Box position='absolute' top='calc(100% + 6px)' left='0' zIndex={20} minW='180px' border='1px solid' borderColor='var(--panel-border)' borderRadius='10px' bg='var(--panel-bg)' boxShadow='md' p={1}>
                            {sortFieldOptions.map((option) => (
                                <Button
                                    key={option.value}
                                    type='button'
                                    size='xs'
                                    variant='ghost'
                                    w='full'
                                    justifyContent='flex-start'
                                    color={props.value.sortField === option.value ? 'var(--app-text)' : 'var(--text-soft)'}
                                    bg={props.value.sortField === option.value ? 'var(--panel-bg-soft)' : 'transparent'}
                                    _hover={{ bg: 'var(--panel-bg-soft)', color: 'var(--app-text)' }}
                                    onClick={() => {
                                        props.onChange({ ...props.value, sortField: option.value });
                                        setIsSortMenuOpen(false);
                                    }}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </Box>
                    ) : null}
                </Box>

                <Button
                    type='button'
                    {...filterButtonStyle}
                    aria-label={props.value.sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                    onClick={() => props.onChange({ ...props.value, sortDirection: props.value.sortDirection === 'asc' ? 'desc' : 'asc' })}
                >
                    {props.value.sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                </Button>

                {props.onClearFilters && isClearable ? (
                    <Button
                        type='button'
                        {...filterButtonStyle}
                        color='var(--text-soft)'
                        onClick={props.onClearFilters}
                    >
                        Clear
                    </Button>
                ) : null}
            </Flex>

            {props.selectionControls ? (
                <Box mt={3} pt={3} borderTop='1px solid' borderColor='var(--panel-border)'>
                    {props.selectionControls}
                </Box>
            ) : null}

            {props.showDnDHint ? (
                <Text fontSize='sm' color='var(--text-muted)' mt={2}>{props.showDnDHint}</Text>
            ) : null}
        </Box>
    );
}