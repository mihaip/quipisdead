/// <reference path="../../worker-configuration.d.ts" />

export type Bindings = Cloudflare.Env & {
  CREDENTIAL_ENCRYPTION_KEY: string;
};

export type WorkerEnv = { Bindings: Bindings };
