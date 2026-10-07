import { Hono } from 'hono';

const app = new Hono().get('/api/hello', (c) => {
  return c.json({ message: 'Hello World' });
});

export type AppType = typeof app;
export default app;
