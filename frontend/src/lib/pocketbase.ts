import PocketBase, { LocalAuthStore } from 'pocketbase';

const authStore = new LocalAuthStore('work_journal_auth');

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090', authStore);

// Prevent the PocketBase JS SDK from auto-canceling in-flight requests during
// quick React route transitions or repeated optimistic queries.
pb.autoCancellation(false);

export const auth = pb.authStore;

export const COLLECTIONS = {
    projects: 'work_journal_projects',
    tasks: 'work_journal_tasks',
    notes: 'work_journal_notes',
    dailyTasks: 'work_journal_daily_tasks',
} as const;
