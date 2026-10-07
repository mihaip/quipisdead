import { hc } from 'hono/client';
import type { InferResponseType } from 'hono/client';
import { useEffect, useState } from 'react';
import type { AppType } from '../worker';

const client = hc<AppType>(window.location.origin);

type HelloState =
  | { status: 'loading' }
  | { status: 'success'; data: InferResponseType<typeof client.api.hello.$get> }
  | { status: 'error'; message: string };

export default function App() {
  const [hello, setHello] = useState<HelloState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHello() {
      try {
        const response = await client.api.hello.$get({}, {
          init: { signal: controller.signal },
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const data = await response.json();

        if (!data || typeof data.message !== 'string') {
          throw new Error('The server returned an invalid greeting');
        }

        if (!controller.signal.aborted) {
          setHello({ status: 'success', data });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHello({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load the greeting',
          });
        }
      }
    }

    void loadHello();
    return () => controller.abort();
  }, []);

  return (
    <main>
      <p>Quip archive</p>
      {hello.status === 'loading' && <p role="status">Loading greeting…</p>}
      {hello.status === 'error' && <p role="alert">{hello.message}</p>}
      {hello.status === 'success' && <h1>{hello.data.message}</h1>}
    </main>
  );
}
