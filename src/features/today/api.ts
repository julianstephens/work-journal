import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { DailyTask, DailyTaskWithTask, Task } from '../../types/pocketbase';

function toPocketBaseDate(date: string): string {
    return `${date} 00:00:00.000Z`;
}

function nextLocalDate(date: string): string {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
}

function dateFilter(date: string): string {
    return `date >= "${toPocketBaseDate(date)}" && date < "${toPocketBaseDate(nextLocalDate(date))}"`;
}

export async function listToday(date: string): Promise<DailyTaskWithTask[]> {
    const dailyRecords = (await pb.collection(COLLECTIONS.dailyTasks).getFullList({
        filter: dateFilter(date),
        sort: 'position',
    })) as DailyTask[];

    const tasks = await Promise.all(
        dailyRecords.map((record) => pb.collection(COLLECTIONS.tasks).getOne(record.task) as Promise<Task>),
    );

    return dailyRecords.map((record, index) => ({ ...record, task: tasks[index] }));
}

export async function addTaskToToday(date: string, taskId: string, position = 0): Promise<DailyTask> {
    const existing = (await pb.collection(COLLECTIONS.dailyTasks).getFullList({
        filter: `${dateFilter(date)} && task = "${taskId}"`,
    })) as DailyTask[];

    if (existing[0]) {
        return existing[0];
    }

    return pb.collection(COLLECTIONS.dailyTasks).create({
        user: requireAuthUserId(),
        date: toPocketBaseDate(date),
        task: taskId,
        position,
    }) as Promise<DailyTask>;
}

export async function removeTaskFromToday(dailyTaskId: string): Promise<void> {
    await pb.collection(COLLECTIONS.dailyTasks).delete(dailyTaskId);
}
