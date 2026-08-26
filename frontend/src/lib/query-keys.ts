export const queryKeys = {
    projects: {
        all: ['projects', 'all'],
        detail: (projectId: string) => ['projects', 'detail', projectId],
    },
    tasks: {
        project: (projectId: string) => ['tasks', 'project', projectId],
        inbox: () => ['tasks', 'inbox'],
        detail: (taskId: string) => ['tasks', 'detail', taskId],
    },
    today: {
        date: (date: string) => ['today', date],
    },
    notes: {
        project: (projectId: string) => ['notes', 'project', projectId],
        detail: (noteId: string) => ['notes', 'detail', noteId],
    },
};
