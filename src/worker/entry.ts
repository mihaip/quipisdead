import app from './index';
import { dispatchPendingCaptures } from './capture/store';
import type { Bindings } from './env';

export default {
  fetch: app.fetch,
  async scheduled(_event, env) { await dispatchPendingCaptures(env); },
} satisfies ExportedHandler<Bindings>;
