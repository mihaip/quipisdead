// Bundled only by tests; no controls are present in either production entry.
import app from '../src/worker/index';
import entry from '../src/worker/entry';
import { appendCaptureProgress, claimCapture, completeCapture, readLatestCaptureJob } from '../src/worker/capture/store';
import type { CaptureMessage } from '../src/worker/capture/model';
import type { Bindings } from '../src/worker/env';
import type { QuipIdentity } from '../src/worker/quip/client';

let dispatchOutage = false;
export default {
  async fetch(request: Request, env: Bindings) {
    const queue = env.CAPTURE_QUEUE;
    const testEnv = dispatchOutage ? { ...env, CAPTURE_QUEUE: {
      send: async () => { throw new Error('Fixture dispatch outage'); },
      sendBatch: queue.sendBatch.bind(queue), metrics: queue.metrics.bind(queue),
    } } : env;
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/test/')) return app.fetch(request, testEnv);
    const body = await request.json() as { userId: string; message: CaptureMessage; lease: string; identity: QuipIdentity; text: string };
    if (path === '/test/read') return Response.json(await readLatestCaptureJob(env.DB, body.userId));
    if (path === '/test/dispatch-outage') dispatchOutage = true;
    if (path === '/test/recover') { dispatchOutage = false; await entry.scheduled({ cron: '* * * * *', scheduledTime: Date.now(), noRetry() {} }, env); }
    if (path === '/test/claim') return Response.json(await claimCapture(env.DB, body.message));
    if (path === '/test/progress') return Response.json(await appendCaptureProgress(env.DB, body.message, body.lease, body.text));
    if (path === '/test/complete') await completeCapture(env.DB, body.message, body.lease, body.identity);
    if (path === '/test/send') await queue.send(body.message);
    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler<Bindings>;
