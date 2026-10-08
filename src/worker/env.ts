/// <reference path="../../worker-configuration.d.ts" />
import type { CaptureMessage } from './capture/model';

export type CaptureBindings = {
  DB: D1Database;
  CREDENTIAL_ENCRYPTION_KEY: string;
};

export type Bindings = CaptureBindings & {
  CAPTURE_QUEUE: Queue<CaptureMessage>;
};

export type WorkerEnv = { Bindings: Bindings };
