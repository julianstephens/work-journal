import { COLLECTIONS, pb } from '../../lib/pocketbase';
import type { DailyTask, DailyTaskWithTask, Task } from '../../types/pocketbase';

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

export async function listTodayTasks(date: string): Promise<DailyTaskWithTask[]> {
    const items = (await pb.collection(COLLECTIONS.dailyTasks).getFullList({
        filter: `date = "${date}"`,
        sort: 'position',
    })) as DailyTask[];

    const tasks = await Promise.all(items.map((item) => getTask(item.task)));

    return items.map((item, index) => ({
        ...item,
        task: tasks[index],
    }));
}

export async function addTaskToToday(taskId: string, date: string, position = 0): Promise<DailyTask> {
    return pb.collection(COLLECTIONS.dailyTasks).create({
        date,
        task: taskId,
        position,
    }) as Promise<DailyTask>;
}

export async function removeTaskFromToday(dailyTaskId: string): Promise<void> {
    await pb.collection(COLLECTIONS.dailyTasks).delete(dailyTaskId);
}
