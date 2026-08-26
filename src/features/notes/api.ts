import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { Note } from '../../types/pocketbase';

type RecordLike = Partial<Note> & {
    get?: (field: string) => unknown;
    toJSON?: () => unknown;
    export?: () => unknown;
};

function readRecordValue(record: RecordLike, key: string): unknown {
    const direct = record[key as keyof RecordLike];
    if (direct !== undefined) return direct;

    if (typeof record.get === 'function') {
        return record.get(key);
    }

    if (typeof record.toJSON === 'function') {
        const json = record.toJSON();
        if (json && typeof json === 'object') {
            const value = (json as Record<string, unknown>)[key];
            if (value !== undefined) return value;
        }
    }

    if (typeof record.export === 'function') {
        const exported = record.export();
        if (exported && typeof exported === 'object') {
            const value = (exported as Record<string, unknown>)[key];
            if (value !== undefined) return value;
        }
    }

    return undefined;
}

function asString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function applyLifecycleFallbacks(note: Note, fallbackCreated = '', fallbackUpdated = ''): Note {
    const fallbackTimestamp = new Date().toISOString();
    const created = note.created || fallbackCreated || fallbackTimestamp;
    const updated = note.updated || fallbackUpdated || note.created || fallbackCreated || fallbackTimestamp;
    return {
        ...note,
        created,
        updated,
    };
}

function hasLifecycle(note: Note): boolean {
    return Boolean(note.created && note.updated);
}

function normalizeNote(record: RecordLike): Note {
    const fallbackTimestamp = new Date().toISOString();
    const created = asString(
        readRecordValue(record, 'created')
        ?? readRecordValue(record, 'createdAt')
        ?? readRecordValue(record, 'created_at'),
    ) || fallbackTimestamp;
    const updated = asString(
        readRecordValue(record, 'updated')
        ?? readRecordValue(record, 'updatedAt')
        ?? readRecordValue(record, 'updated_at'),
    ) || created;

    return {
        id: asString(readRecordValue(record, 'id')),
        user: asString(readRecordValue(record, 'user')),
        project: (readRecordValue(record, 'project') as string | null | undefined) ?? null,
        task: (readRecordValue(record, 'task') as string | null | undefined) ?? null,
        title: asString(readRecordValue(record, 'title')),
        body: asString(readRecordValue(record, 'body')),
        created,
        updated,
    };
}

async function fetchNormalizedNote(noteId: string): Promise<Note> {
    const record = await pb.collection(COLLECTIONS.notes).getOne(noteId) as RecordLike;
    return normalizeNote(record);
}

async function hydrateMissingLifecycle(notes: Note[]): Promise<Note[]> {
    const missing = notes.filter((note) => !hasLifecycle(note));
    if (missing.length === 0) return notes;

    const hydrated = await Promise.all(missing.map((note) => fetchNormalizedNote(note.id)));
    const byId = new Map(hydrated.map((note) => [note.id, note]));

    return notes.map((note) => {
        const refreshed = byId.get(note.id);
        if (!refreshed) return note;
        return applyLifecycleFallbacks(refreshed, note.created, note.updated);
    });
}

function toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
}

function sortNotesByCreatedAscending(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => toTimestamp(a.created) - toTimestamp(b.created));
}

function sortNotesByUpdatedDescending(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => {
        const bTime = toTimestamp(b.updated) || toTimestamp(b.created);
        const aTime = toTimestamp(a.updated) || toTimestamp(a.created);
        return bTime - aTime;
    });
}

export async function listNotesForProject(projectId: string): Promise<Note[]> {
    const records = await pb.collection(COLLECTIONS.notes).getFullList({
        filter: `project = "${projectId}"`,
    }) as RecordLike[];

    const notes = await hydrateMissingLifecycle(records.map(normalizeNote));

    return sortNotesByCreatedAscending(notes);
}

export async function listNotes(): Promise<Note[]> {
    const records = await pb.collection(COLLECTIONS.notes).getFullList() as RecordLike[];
    const notes = await hydrateMissingLifecycle(records.map(normalizeNote));

    return sortNotesByUpdatedDescending(notes);
}

export async function getNote(noteId: string): Promise<Note> {
    return fetchNormalizedNote(noteId);
}

export async function findNoteForTask(projectId: string, taskId: string): Promise<Note | null> {
    const records = await pb.collection(COLLECTIONS.notes).getFullList({
        filter: `project = "${projectId}" && task = "${taskId}"`,
    }) as RecordLike[];

    if (records.length === 0) return null;
    return hydrateMissingLifecycle(records.map(normalizeNote)).then((notes) => notes[0] ?? null);
}

export async function createNote(input: { project?: string | null; task?: string | null; title: string; body: string; }): Promise<Note> {
    const payload = {
        user: requireAuthUserId(),
        title: input.title.trim() || 'Untitled note',
        body: input.body.trim() || ' ',
        ...(input.project ? { project: input.project } : {}),
        ...(input.task ? { task: input.task } : {}),
    };

    const record = await pb.collection(COLLECTIONS.notes).create(payload) as RecordLike;

    const note = normalizeNote(record);
    // Always hydrate from canonical record to avoid mutation responses omitting system fields.
    const refreshed = await getNote(note.id);
    const now = new Date().toISOString();
    return hasLifecycle(refreshed)
        ? refreshed
        : applyLifecycleFallbacks(refreshed, note.created || now, note.updated || now);
}

export async function updateNote(
    noteId: string,
    input: Partial<Pick<Note, 'title' | 'body' | 'project' | 'task'>>,
): Promise<Note> {
    const previous = await getNote(noteId);
    await pb.collection(COLLECTIONS.notes).update(noteId, input);
    // Always hydrate from canonical record to avoid mutation responses omitting system fields.
    const refreshed = await getNote(noteId);
    const preservedCreated = previous.created || refreshed.created || new Date().toISOString();
    const fallbackUpdated = refreshed.updated || previous.updated || new Date().toISOString();
    return {
        ...refreshed,
        created: preservedCreated,
        updated: fallbackUpdated,
    };
}

export async function deleteNote(noteId: string): Promise<void> {
    await pb.collection(COLLECTIONS.notes).delete(noteId);
}
