import { COLLECTIONS, pb } from '../../lib/pocketbase';
import type { Project } from '../../types/pocketbase';

export async function listProjects(): Promise<Project[]> {
    return pb.collection(COLLECTIONS.projects).getFullList({ sort: 'position' }) as Promise<Project[]>;
}

export async function createProject(input: {
    name: string;
    description?: string;
    archived?: boolean;
    position?: number;
}): Promise<Project> {
    return pb.collection(COLLECTIONS.projects).create({
        ...input,
        archived: input.archived ?? false,
        position: input.position ?? 0,
    }) as Promise<Project>;
}

export async function updateProject(
    projectId: string,
    input: Partial<Pick<Project, 'name' | 'description' | 'archived' | 'position'>>,
): Promise<Project> {
    return pb.collection(COLLECTIONS.projects).update(projectId, input) as Promise<Project>;
}

export async function deleteProject(projectId: string): Promise<void> {
    await pb.collection(COLLECTIONS.projects).delete(projectId);
}
