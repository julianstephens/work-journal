import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { DailyTask, Task } from '../../types/pocketbase';

export async function listTasksForProject(projectId: string): Promise<Task[]> {
    return pb
        .collection(COLLECTIONS.tasks)
        .getFullList({
            filter: `project = "${projectId}"`,
            sort: 'position',
        }) as Promise<Task[]>;
}

export async function listAllTasks(): Promise<Task[]> {
    return pb
        .collection(COLLECTIONS.tasks)
        .getFullList({
            sort: 'position',
        }) as Promise<Task[]>;
}

export async function listInboxTasks(): Promise<Task[]> {
    return listAllTasks();
}

export async function getTask(taskId: string): Promise<Task> {
    return pb.collection(COLLECTIONS.tasks).getOne(taskId) as Promise<Task>;
}

export async function createTask(input: {
    title: string;
    project?: string | null;
    parent?: string | null;
    position?: number;
    completed?: boolean;
}): Promise<Task> {
    return pb.collection(COLLECTIONS.tasks).create({
        user: requireAuthUserId(),
        title: input.title,
        project: input.project ?? null,
        parent: input.parent ?? null,
        position: input.position ?? 0,
        completed: input.completed ?? false,
    }) as Promise<Task>;
}

export async function updateTask(
    taskId: string,
    input: Partial<Pick<Task, 'title' | 'project' | 'parent' | 'position' | 'completed' | 'completed_at'>>,
): Promise<Task> {
    return pb.collection(COLLECTIONS.tasks).update(taskId, input) as Promise<Task>;
}

async function deleteDailyTaskLinks(taskId: string): Promise<void> {
    const links = (await pb.collection(COLLECTIONS.dailyTasks).getFullList({
        filter: `task = "${taskId}"`,
    })) as DailyTask[];

    await Promise.all(
        links.map((dailyTask) => pb.collection(COLLECTIONS.dailyTasks).delete(dailyTask.id)),
    );
}

export async function deleteTask(taskId: string): Promise<void> {
    await deleteDailyTaskLinks(taskId);
    await pb.collection(COLLECTIONS.tasks).delete(taskId);
}

function collectDescendants(tasks: Task[], rootTaskId: string): Task[] {
    const byParent = new Map<string, Task[]>();

    tasks.forEach((task) => {
        if (!task.parent) return;
        const siblings = byParent.get(task.parent);
        if (!siblings) byParent.set(task.parent, [task]);
        else siblings.push(task);
    });

    const descendants: Task[] = [];
    const queue = [...(byParent.get(rootTaskId) ?? [])];
    const seen = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || seen.has(current.id)) continue;

        seen.add(current.id);
        descendants.push(current);

        const children = byParent.get(current.id) ?? [];
        children.forEach((child) => queue.push(child));
    }

    return descendants;
}

export async function toggleTaskCompletion(taskId: string, completed: boolean): Promise<Task> {
    const task = await getTask(taskId);
    const completedAt = completed ? new Date().toISOString() : null;

    const updatedTask = await updateTask(taskId, {
        completed,
        completed_at: completedAt,
        parent: task.parent,
        project: task.project,
    });

    if (!completed) {
        return updatedTask;
    }

    const relatedTasks = await pb
        .collection(COLLECTIONS.tasks)
        .getFullList({
            filter: task.project ? `project = "${task.project}"` : 'project = null',
            sort: 'position',
        }) as Task[];

    const descendants = collectDescendants(relatedTasks, taskId);
    const toComplete = descendants.filter((descendant) => !descendant.completed);

    await Promise.all(
        toComplete.map((descendant) => updateTask(descendant.id, {
            completed: true,
            completed_at: completedAt,
            parent: descendant.parent,
            project: descendant.project,
        })),
    );

    return updatedTask;
}

export async function moveTask(taskId: string, input: { parentId?: string | null; position: number; }): Promise<Task> {
    return updateTask(taskId, {
        parent: input.parentId ?? null,
        position: input.position,
    });
}
