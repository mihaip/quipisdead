import { useQuery } from '@tanstack/react-query';
import { hc, parseResponse } from 'hono/client';
import type { AppType } from '../worker';

const client = hc<AppType>(window.location.origin);

export default function App() {
  const hello = useQuery({
    queryKey: ['hello'],
    queryFn: ({ signal }) =>
      parseResponse(client.api.hello.$get({}, { init: { signal } })),
  });

  return (
    <main>
      <p>Quip archive</p>
      {hello.isPending && <p role="status">Loading greeting…</p>}
      {hello.isError && <p role="alert">{hello.error.message}</p>}
      {hello.isSuccess && <h1>{hello.data.message}</h1>}
    </main>
  );
}
