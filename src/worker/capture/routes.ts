import { Hono } from 'hono';
import type { WorkerEnv } from '../env';
import { sessionHash } from '../auth/session';
import { findSession } from '../auth/store';
import { dispatchCapture, readCaptureJob, readLatestCaptureJob, readCaptureProgress, readCaptureResult, startCapture } from './store';
import { publicJob } from './model';

export const captureRoutes = new Hono<WorkerEnv>()
  .use('*', async (c, next) => {
    if (c.req.method !== 'GET' && (c.req.header('Origin') !== new URL(c.req.url).origin || c.req.header('Sec-Fetch-Site') === 'cross-site')) {
      return c.json({ error: 'This request must come from this app.' }, 403);
    }
    await next();
  })
  .get('/', async (c) => {
    const hash = await sessionHash(c);
    const user = hash ? await findSession(c.env.DB, hash) : null;
    if (!user || !hash) return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
    const [job, result] = await Promise.all([readLatestCaptureJob(c.env.DB, user.id), readCaptureResult(c.env.DB, user.id)]);
    const progress = job ? await readCaptureProgress(c.env.DB, job.jobId) : null;
    return c.json({ job: publicJob(job), progress, result }, 200);
  })
  .post('/', async (c) => {
    const hash = await sessionHash(c);
    const user = hash ? await findSession(c.env.DB, hash) : null;
    if (!user || !hash) return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
    const job = await startCapture(c.env.DB, user.id, hash);
    if (!job) return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
    if (job.dispatchedAt === null) await dispatchCapture(c.env, { userId: job.userId, jobId: job.jobId });
    const current = await readCaptureJob(c.env.DB, { userId: user.id, jobId: job.jobId });
    const progress = current ? await readCaptureProgress(c.env.DB, current.jobId) : null;
    return c.json({ job: publicJob(current), progress }, 202);
  });
