import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';

export function useCapture(userId: string, onSessionExpired: (error: Error) => Promise<void>) {
  const client = useQueryClient();
  const key = ['capture', userId] as const;
  const capture = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.getCapture(signal),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.job?.status;
      return state === 'queued' || state === 'running' ? 1000 : false;
    },
  });
  useEffect(() => {
    if (capture.error) void onSessionExpired(capture.error);
  }, [capture.error, onSessionExpired]);
  const start = useMutation({
    mutationFn: api.startCapture,
    onSuccess: async (data) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Awaited<ReturnType<typeof api.getCapture>>>(key,
        (previous) => ({ job: data.job, progress: data.progress, result: previous?.result ?? null }));
      await client.invalidateQueries({ queryKey: key });
    },
    onError: onSessionExpired,
  });
  return { capture, start };
}
