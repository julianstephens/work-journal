import type { Task } from '../../types/pocketbase';

export type TaskRow = {
    task: Task;
    depth: number;
    parentId: string | null;
};

export type TaskSiblingComparator = (a: Task, b: Task) => number;

function byPositionThenCreated(a: Task, b: Task): number {
    const aPosition = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
    const bPosition = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;

    if (aPosition !== bPosition) return aPosition - bPosition;

    const aCreated = typeof a.created === 'string' ? a.created : '';
    const bCreated = typeof b.created === 'string' ? b.created : '';
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

    // Final deterministic tie-breaker for malformed records missing timestamps.
    return a.id.localeCompare(b.id);
}

function buildChildrenMap(tasks: Task[], compareSiblings: TaskSiblingComparator = byPositionThenCreated): Map<string | null, Task[]> {
    const map = new Map<string | null, Task[]>();

    tasks.forEach((task) => {
        const key = task.parent ?? null;
        const items = map.get(key);
        if (!items) map.set(key, [task]);
        else items.push(task);
    });

    for (const items of map.values()) {
        items.sort(compareSiblings);
    }

    return map;
}

function normalizeParent(tasks: Task[]): Task[] {
    const ids = new Set(tasks.map((task) => task.id));
    return tasks.map((task) => {
        if (!task.parent || !task.parent.trim()) {
            return { ...task, parent: null };
        }

        if (ids.has(task.parent)) return task;
        return { ...task, parent: null };
    });
}

function getTaskDepth(tasksById: Map<string, Task>, task: Task): number {
    let depth = 0;
    let cursor = task.parent ?? null;
    const seen = new Set<string>();

    while (cursor) {
        depth += 1;
        if (seen.has(cursor)) break;
        seen.add(cursor);

        const parent = tasksById.get(cursor);
        if (!parent) break;
        cursor = parent.parent ?? null;
    }

    return depth;
}

export function buildTaskRows(tasks: Task[], compareSiblings: TaskSiblingComparator = byPositionThenCreated): TaskRow[] {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const normalized = normalizeParent(tasks);
    const childrenMap = buildChildrenMap(normalized, compareSiblings);
    const rows: TaskRow[] = [];
    const seen = new Set<string>();

    const walk = (task: Task, depth: number): void => {
        if (seen.has(task.id)) return;
        seen.add(task.id);

        rows.push({ task, depth, parentId: task.parent ?? null });
        (childrenMap.get(task.id) ?? []).forEach((child) => walk(child, depth + 1));
    };

    (childrenMap.get(null) ?? []).forEach((root) => walk(root, getTaskDepth(tasksById, root)));

    normalized
        .filter((task) => task.parent && !tasksById.has(task.parent))
        .sort(compareSiblings)
        .forEach((task) => walk(task, getTaskDepth(tasksById, task)));

    // Recover from malformed graphs where there are no true roots.
    if (seen.size < normalized.length) {
        normalized
            .filter((task) => !seen.has(task.id))
            .sort(compareSiblings)
            .forEach((task) => walk(task, 0));
    }

    return rows;
}

function isDescendant(tasksById: Map<string, Task>, taskId: string, potentialAncestorId: string): boolean {
    let cursor = tasksById.get(taskId)?.parent ?? null;
    const seen = new Set<string>();

    while (cursor) {
        if (cursor === potentialAncestorId) return true;
        if (seen.has(cursor)) return false;
        seen.add(cursor);
        cursor = tasksById.get(cursor)?.parent ?? null;
    }

    return false;
}

export function moveTaskWithinTree(tasks: Task[], taskId: string, nextParentId: string | null, nextIndex: number): Task[] {
    const normalized = normalizeParent(tasks).map((task) => ({ ...task }));
    const tasksById = new Map(normalized.map((task) => [task.id, task]));
    const task = tasksById.get(taskId);

    if (!task) return tasks;
    if (nextParentId === task.id) return tasks;
    if (nextParentId && isDescendant(tasksById, nextParentId, task.id)) return tasks;

    const groups = new Map<string | null, Task[]>();
    normalized.forEach((item) => {
        const key = item.parent ?? null;
        const current = groups.get(key);
        if (!current) groups.set(key, [item]);
        else current.push(item);
    });

    for (const group of groups.values()) {
        group.sort(byPositionThenCreated);
    }

    const oldParentId = task.parent ?? null;
    const oldSiblings = groups.get(oldParentId) ?? [];
    const withoutTask = oldSiblings.filter((item) => item.id !== task.id);
    groups.set(oldParentId, withoutTask);

    const newParentId = nextParentId ?? null;
    const newSiblings = oldParentId === newParentId ? withoutTask : [...(groups.get(newParentId) ?? [])];
    const boundedIndex = Math.max(0, Math.min(nextIndex, newSiblings.length));

    task.parent = newParentId;
    newSiblings.splice(boundedIndex, 0, task);
    groups.set(newParentId, newSiblings);

    const parentsToUpdate = oldParentId === newParentId ? [oldParentId] : [oldParentId, newParentId];
    parentsToUpdate.forEach((parentId) => {
        const siblings = groups.get(parentId) ?? [];
        siblings.forEach((sibling, index) => {
            sibling.position = index;
        });
    });

    return normalized;
}

export function moveTaskUp(tasks: Task[], taskId: string): Task[] {
    const rows = buildTaskRows(tasks);
    const row = rows.find((item) => item.task.id === taskId);
    if (!row) return tasks;

    const siblings = rows.filter((item) => item.parentId === row.parentId).map((item) => item.task.id);
    const currentIndex = siblings.indexOf(taskId);
    if (currentIndex <= 0) return tasks;

    return moveTaskWithinTree(tasks, taskId, row.parentId, currentIndex - 1);
}

export function moveTaskDown(tasks: Task[], taskId: string): Task[] {
    const rows = buildTaskRows(tasks);
    const row = rows.find((item) => item.task.id === taskId);
    if (!row) return tasks;

    const siblings = rows.filter((item) => item.parentId === row.parentId).map((item) => item.task.id);
    const currentIndex = siblings.indexOf(taskId);
    if (currentIndex === -1 || currentIndex >= siblings.length - 1) return tasks;

    return moveTaskWithinTree(tasks, taskId, row.parentId, currentIndex + 1);
}

export function indentTask(tasks: Task[], taskId: string): Task[] {
    const rows = buildTaskRows(tasks);
    const index = rows.findIndex((row) => row.task.id === taskId);
    if (index <= 0) return tasks;

    const row = rows[index];
    const previous = rows[index - 1];
    const childCount = rows.filter((item) => item.parentId === previous.task.id).length;

    return moveTaskWithinTree(tasks, row.task.id, previous.task.id, childCount);
}

export function outdentTask(tasks: Task[], taskId: string): Task[] {
    const rows = buildTaskRows(tasks);
    const row = rows.find((item) => item.task.id === taskId);
    if (!row || !row.parentId) return tasks;

    const parentRow = rows.find((item) => item.task.id === row.parentId);
    if (!parentRow) return moveTaskWithinTree(tasks, taskId, null, rows.filter((item) => item.parentId === null).length);

    const grandParentId = parentRow.parentId;
    const uncles = rows.filter((item) => item.parentId === grandParentId);
    const parentIndex = uncles.findIndex((item) => item.task.id === parentRow.task.id);

    return moveTaskWithinTree(tasks, taskId, grandParentId, Math.max(parentIndex + 1, 0));
}

export function collectSubtreeIds(tasks: Task[], rootId: string): string[] {
    const children = buildChildrenMap(normalizeParent(tasks));
    const ids: string[] = [];
    const seen = new Set<string>();

    const walk = (taskId: string): void => {
        if (seen.has(taskId)) return;
        seen.add(taskId);
        ids.push(taskId);
        (children.get(taskId) ?? []).forEach((child) => walk(child.id));
    };

    walk(rootId);
    return ids;
}

export type TaskPositionChange = {
    id: string;
    parent: string | null;
    position: number;
};

export function derivePositionChanges(previous: Task[], next: Task[]): TaskPositionChange[] {
    const previousMap = new Map(previous.map((task) => [task.id, task]));

    return next
        .filter((task) => {
            const existing = previousMap.get(task.id);
            if (!existing) return false;
            return (existing.parent ?? null) !== (task.parent ?? null) || existing.position !== task.position;
        })
        .map((task) => ({
            id: task.id,
            parent: task.parent ?? null,
            position: task.position,
        }));
}

export function listMoveUnderCandidates(tasks: Task[], taskId: string): Task[] {
    const invalid = new Set(collectSubtreeIds(tasks, taskId));
    return tasks.filter((task) => !invalid.has(task.id)).sort(byPositionThenCreated);
}
