import { COLLECTIONS, pb } from '../../lib/pocketbase';
import type { DailyTask, DailyTaskWithTask, Task } from '../../types/pocketbase';

export async function listToday(date: string): Promise<DailyTaskWithTask[]> {
    const dailyRecords = (await pb.collection(COLLECTIONS.dailyTasks).getFullList({
        filter: `date = "${date}"`,
        sort: 'position',
    })) as DailyTask[];

    const tasks = await Promise.all(
        dailyRecords.map((record) => pb.collection(COLLECTIONS.tasks).getOne(record.task) as Promise<Task>),
    );

    return dailyRecords.map((record, index) => ({ ...record, task: tasks[index] }));
}

export async function addTaskToToday(date: string, taskId: string, position = 0): Promise<DailyTask> {
    return pb.collection(COLLECTIONS.dailyTasks).create({
        date,
        task: taskId,
        position,
    }) as Promise<DailyTask>;
}

export async function removeTaskFromToday(dailyTaskId: string): Promise<void> {
    await pb.collection(COLLECTIONS.dailyTasks).delete(dailyTaskId);
}
