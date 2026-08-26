export type Project = {
    id: string;
    user: string;
    name: string;
    description?: string;
    archived: boolean;
    position: number;
    created: string;
    updated: string;
};

export type Task = {
    id: string;
    user: string;
    project: string | null;
    parent: string | null;
    title: string;
    completed: boolean;
    position: number;
    completed_at: string | null;
    created: string;
    updated: string;
};

export type Note = {
    id: string;
    user: string;
    project: string | null;
    title: string;
    body: string;
    created: string;
    updated: string;
};

export type DailyTask = {
    id: string;
    user: string;
    date: string;
    task: string;
    position: number;
    created: string;
    updated: string;
};

export type DailyTaskWithTask = Omit<DailyTask, 'task'> & {
    task: Task;
};
