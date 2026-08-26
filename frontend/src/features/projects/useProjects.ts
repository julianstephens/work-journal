import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { listProjects } from './api';

export function useProjects() {
    return useQuery({
        queryKey: queryKeys.projects.all,
        queryFn: listProjects,
    });
}
