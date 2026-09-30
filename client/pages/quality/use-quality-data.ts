import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';
import type { QualityUser, RunDetail, RunSummary } from './types.js';

// Loads one quality endpoint and reloads it when the revision changes; an empty path loads nothing.
export function useRequest<T>(path: string, revision: number) {
  const api = useApiClient();
  const [state, setState] = useState<{
    path: string;
    data?: T;
    failed?: boolean;
  }>({ path: '' });
  useEffect(() => {
    if (!path) return;
    let current = true;
    void api
      .request<{ data: T }>({ path })
      .then((r) => {
        if (current) setState({ path, data: r.data });
      })
      .catch(() => {
        if (current) setState({ path, failed: true });
      });
    return () => {
      current = false;
    };
  }, [api, path, revision]);
  return state.path === path ? state : { path };
}

export function useUsers() {
  const users = useRequest<QualityUser[]>('quality/users', 0).data;
  return Array.isArray(users) ? users : [];
}

// The most recent run with its results, used by the matrix and the overview.
export function useLatestRun(projectId: number, revision: number) {
  const runs = useRequest<RunSummary[]>(
    projectId ? 'quality/projects/' + projectId + '/runs' : '',
    revision,
  ).data;
  const latest = Array.isArray(runs) ? runs[0] : undefined;
  const detail = useRequest<RunDetail>(
    latest ? 'quality/projects/' + projectId + '/runs/' + latest.id : '',
    revision,
  ).data;
  return latest && detail?.run.id === latest.id ? detail : undefined;
}
