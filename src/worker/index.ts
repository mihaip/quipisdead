import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { captureRoutes } from './capture/routes';
import { authRoutes } from './auth/routes';
import type { WorkerEnv } from './env';

const app = new Hono<WorkerEnv>()
  .use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  })
  .route('/api/auth', authRoutes)
  .route('/api/capture', captureRoutes);

app.onError((error, c) => {
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  // Do not log exceptions, requests or upstream bodies: they may contain credentials.
  console.error('API request failed');
  return c.json({ error: 'The app could not complete this request. Please try again.' }, 500);
});

app.notFound((c) => c.json({ error: 'API route not found.' }, 404));

export type AppType = typeof app;
export default app;
