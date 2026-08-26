import { useEffect, useMemo, useState } from 'react';
import { buildTaskRows, type TaskRow, type TaskSiblingComparator } from '../../features/tasks/tree';
import { makeUserScopedStorageKey, readStoredJson, writeStoredJson } from '../../lib/local-storage';
import type { Task } from '../../types/pocketbase';

export const TASK_FILTER_PROJECT_ALL = 'all';
export const TASK_FILTER_PROJECT_UNASSIGNED = 'unassigned';

export type TaskSortField = 'manual' | 'title' | 'created' | 'updated';
export type TaskSortDirection = 'asc' | 'desc';
export type TaskCompletionStatus = 'all' | 'open' | 'completed';

export type TaskFilterState = {
    sortField: TaskSortField;
    sortDirection: TaskSortDirection;
    completionStatus: TaskCompletionStatus;
    projectId: string;
    searchQuery: string;
};

export const DEFAULT_TASK_FILTER_STATE: TaskFilterState = {
    sortField: 'manual',
    sortDirection: 'asc',
    completionStatus: 'all',
    projectId: TASK_FILTER_PROJECT_ALL,
    searchQuery: '',
};

export type TaskProjectOption = {
    id: string;
    label: string;
};

function normalizeTaskSortField(value: unknown): TaskSortField {
    return value === 'title' || value === 'created' || value === 'updated' || value === 'manual'
        ? value
        : DEFAULT_TASK_FILTER_STATE.sortField;
}

function normalizeTaskSortDirection(value: unknown): TaskSortDirection {
    return value === 'desc' ? 'desc' : 'asc';
}

function normalizeTaskCompletionStatus(value: unknown): TaskCompletionStatus {
    return value === 'open' || value === 'completed' || value === 'all'
        ? value
        : DEFAULT_TASK_FILTER_STATE.completionStatus;
}

export function normalizeTaskFilterState(value: Partial<TaskFilterState> | null | undefined): TaskFilterState {
    return {
        sortField: normalizeTaskSortField(value?.sortField),
        sortDirection: normalizeTaskSortDirection(value?.sortDirection),
        completionStatus: normalizeTaskCompletionStatus(value?.completionStatus),
        projectId: typeof value?.projectId === 'string' && value.projectId.trim()
            ? value.projectId
            : DEFAULT_TASK_FILTER_STATE.projectId,
        searchQuery: typeof value?.searchQuery === 'string' ? value.searchQuery : DEFAULT_TASK_FILTER_STATE.searchQuery,
    };
}

export function makeTaskFiltersStorageKey(baseKey: string, userId?: string): string {
    return makeUserScopedStorageKey(baseKey, userId);
}

export function useTaskFiltersStorage(baseKey: string, userId?: string) {
    const storageKey = useMemo(() => makeTaskFiltersStorageKey(baseKey, userId), [baseKey, userId]);
    const [filters, setFilters] = useState<TaskFilterState>(() => normalizeTaskFilterState(readStoredJson(storageKey, DEFAULT_TASK_FILTER_STATE)));

    useEffect(() => {
        setFilters(normalizeTaskFilterState(readStoredJson(storageKey, DEFAULT_TASK_FILTER_STATE)));
    }, [storageKey]);

    useEffect(() => {
        writeStoredJson(storageKey, filters);
    }, [filters, storageKey]);

    return [filters, setFilters, storageKey] as const;
}

export function isTaskFiltersActive(filters: TaskFilterState): boolean {
    return filters.sortField !== DEFAULT_TASK_FILTER_STATE.sortField
        || filters.sortDirection !== DEFAULT_TASK_FILTER_STATE.sortDirection
        || filters.completionStatus !== DEFAULT_TASK_FILTER_STATE.completionStatus
        || filters.projectId !== DEFAULT_TASK_FILTER_STATE.projectId
        || filters.searchQuery.trim() !== DEFAULT_TASK_FILTER_STATE.searchQuery;
}

function getTaskSortComparator(sortField: TaskSortField, sortDirection: TaskSortDirection): TaskSiblingComparator {
    const direction = sortDirection === 'asc' ? 1 : -1;

    const compareString = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const safeString = (value: unknown): string => (typeof value === 'string' ? value : '');

    const compareValues = (a: string, b: string): number => compareString(a, b);
    const compareByCreated = (a: Task, b: Task): number => {
        const createdComparison = compareValues(safeString(a.created), safeString(b.created));
        if (createdComparison !== 0) return createdComparison;

        const titleComparison = compareString(a.title, b.title);
        if (titleComparison !== 0) return titleComparison;

        return a.id.localeCompare(b.id);
    };

    const compareByUpdated = (a: Task, b: Task): number => {
        const updatedComparison = compareValues(safeString(a.updated), safeString(b.updated));
        if (updatedComparison !== 0) return updatedComparison;

        const titleComparison = compareString(a.title, b.title);
        if (titleComparison !== 0) return titleComparison;

        return a.id.localeCompare(b.id);
    };

    const compareByTitle = (a: Task, b: Task): number => {
        const titleComparison = compareString(a.title, b.title);
        if (titleComparison !== 0) return titleComparison;

        const createdComparison = compareValues(safeString(a.created), safeString(b.created));
        if (createdComparison !== 0) return createdComparison;

        return a.id.localeCompare(b.id);
    };

    const manualComparator: TaskSiblingComparator = (a, b) => {
        const aPosition = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
        const bPosition = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
        if (aPosition !== bPosition) return aPosition - bPosition;

        const aCreated = typeof a.created === 'string' ? a.created : '';
        const bCreated = typeof b.created === 'string' ? b.created : '';
        if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

        return a.id.localeCompare(b.id);
    };

    if (sortField === 'manual') {
        return direction === 1 ? manualComparator : (a, b) => manualComparator(b, a);
    }

    const fieldComparator: TaskSiblingComparator = sortField === 'title'
        ? compareByTitle
        : sortField === 'created'
            ? compareByCreated
            : compareByUpdated;

    return direction === 1 ? fieldComparator : (a, b) => fieldComparator(b, a);
}

function matchesTaskFilters(task: Task, filters: TaskFilterState): boolean {
    if (filters.completionStatus === 'open' && task.completed) return false;
    if (filters.completionStatus === 'completed' && !task.completed) return false;

    if (filters.projectId === TASK_FILTER_PROJECT_UNASSIGNED && task.project !== null) return false;
    if (filters.projectId !== TASK_FILTER_PROJECT_ALL && filters.projectId !== TASK_FILTER_PROJECT_UNASSIGNED && task.project !== filters.projectId) return false;

    const query = filters.searchQuery.trim().toLowerCase();
    if (query && !task.title.toLowerCase().includes(query)) return false;

    return true;
}

function collectVisibleTaskIds(tasks: Task[], filters: TaskFilterState): Set<string> {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const visibleIds = new Set<string>();

    const includeTaskAndAncestors = (task: Task): void => {
        let cursor: Task | undefined = task;
        while (cursor && !visibleIds.has(cursor.id)) {
            visibleIds.add(cursor.id);
            cursor = cursor.parent ? tasksById.get(cursor.parent) : undefined;
        }
    };

    tasks.forEach((task) => {
        if (matchesTaskFilters(task, filters)) {
            includeTaskAndAncestors(task);
        }
    });

    return visibleIds;
}

export function buildFilteredTaskRows(tasks: Task[], filters: TaskFilterState): { rows: TaskRow[]; matchingCount: number; } {
    const normalized = normalizeTaskFilterState(filters);
    const matchingTasks = tasks.filter((task) => matchesTaskFilters(task, normalized));
    const visibleIds = collectVisibleTaskIds(tasks, normalized);
    const visibleTasks = tasks.filter((task) => visibleIds.has(task.id));
    const rows = buildTaskRows(visibleTasks, getTaskSortComparator(normalized.sortField, normalized.sortDirection));

    return {
        rows,
        matchingCount: matchingTasks.length,
    };
}
