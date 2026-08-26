import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { Task } from '../../types/pocketbase';

export async function listTasksForProject(projectId: string): Promise<Task[]> {
    return pb
        .collection(COLLECTIONS.tasks)
        .getFullList({
            filter: `project = "${projectId}"`,
            sort: 'position',
        }) as Promise<Task[]>;
}

export async function listInboxTasks(): Promise<Task[]> {
    return pb
        .collection(COLLECTIONS.tasks)
        .getFullList({
            filter: 'project = null',
            sort: 'position',
        }) as Promise<Task[]>;
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

export async function deleteTask(taskId: string): Promise<void> {
    await pb.collection(COLLECTIONS.tasks).delete(taskId);
}

export async function toggleTaskCompletion(taskId: string, completed: boolean): Promise<Task> {
    const task = await getTask(taskId);

    return updateTask(taskId, {
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        parent: task.parent,
        project: task.project,
    });
}

export async function moveTask(taskId: string, input: { parentId?: string | null; position: number; }): Promise<Task> {
    return updateTask(taskId, {
        parent: input.parentId ?? null,
        position: input.position,
    });
}
