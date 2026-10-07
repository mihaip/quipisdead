import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as api from '../api';

const sessionKey = ['session'] as const;
type Session = Awaited<ReturnType<typeof api.getSession>>;

export function useAccount() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => api.getSession(signal),
    retry: false,
  });

  async function updateSession(data: Session) {
    // An older in-flight profile read must not restore signed-out UI.
    await queryClient.cancelQueries({ queryKey: sessionKey });
    queryClient.setQueryData(sessionKey, data);
  }

  async function onError(error: Error) {
    if (error instanceof api.ApiError && error.status === 401) {
      await updateSession({ user: null });
      setNotice('Your session has expired. Please sign in again.');
    }
  }

  const signIn = useMutation({
    mutationFn: api.signIn,
    gcTime: 0,
    onSuccess: async (data) => { await updateSession(data); setNotice(''); },
  });
  const replacePat = useMutation({
    mutationFn: api.replacePat,
    gcTime: 0,
    onSuccess: async (data) => { await updateSession(data); setNotice('Your personal access token was replaced.'); },
    onError,
  });
  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: async (data) => { await updateSession(data); setNotice('You are signed out.'); },
  });
  const deleteAccount = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: async (data) => { await updateSession(data); setNotice('Your app account has been deleted.'); },
    onError,
  });

  return { session, signIn, replacePat, signOut, deleteAccount, notice };
}
