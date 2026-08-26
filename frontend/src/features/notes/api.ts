import { COLLECTIONS, pb, requireAuthUserId } from '../../lib/pocketbase';
import type { Note } from '../../types/pocketbase';

export async function listNotesForProject(projectId: string): Promise<Note[]> {
    return pb.collection(COLLECTIONS.notes).getFullList({
        filter: `project = "${projectId}"`,
        sort: 'created',
    }) as Promise<Note[]>;
}

export async function listNotes(): Promise<Note[]> {
    return pb.collection(COLLECTIONS.notes).getFullList({ sort: '-updated' }) as Promise<Note[]>;
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
