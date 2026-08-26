import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { Note } from '../../types/pocketbase';

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
    const notes = await pb.collection(COLLECTIONS.notes).getFullList({
        filter: `project = "${projectId}"`,
    }) as Note[];

    return sortNotesByCreatedAscending(notes);
}

export async function listNotes(): Promise<Note[]> {
    const notes = await pb.collection(COLLECTIONS.notes).getFullList() as Note[];

    return sortNotesByUpdatedDescending(notes);
}

export async function getNote(noteId: string): Promise<Note> {
    return pb.collection(COLLECTIONS.notes).getOne(noteId) as Promise<Note>;
}

export async function createNote(input: { project?: string | null; title: string; body: string; }): Promise<Note> {
    return pb.collection(COLLECTIONS.notes).create({
        user: requireAuthUserId(),
        ...input,
    }) as Promise<Note>;
}

export async function updateNote(
    noteId: string,
    input: Partial<Pick<Note, 'title' | 'body' | 'project'>>,
): Promise<Note> {
    return pb.collection(COLLECTIONS.notes).update(noteId, input) as Promise<Note>;
}

export async function deleteNote(noteId: string): Promise<void> {
    await pb.collection(COLLECTIONS.notes).delete(noteId);
}
